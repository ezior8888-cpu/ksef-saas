'use server';

/**
 * Akcje serwerowe agenta FLO — jedyny most między interfejsem a silnikiem.
 *
 * KONTRAKT: część III.3 planu. Tor interfejsu woła wyłącznie te funkcje
 * i nie sięga do `lib/flo/*` bezpośrednio.
 *
 * TRZY RZECZY, KTÓRE MUSZĄ TU BYĆ ZROBIONE DOKŁADNIE TAK:
 *
 * 1. IMPORT `@/lib/flo/functions` — skutek uboczny: rejestracja wykonawców.
 *    Bez niego rejestr jest pusty i agent odpowiada „tego jeszcze nie umiem
 *    wykonać" na każde kliknięcie. Zdarzyło się to już raz w workerze;
 *    tutaj kosztowałoby dzień szukania.
 *
 * 2. ŻETON ZGODY POWSTAJE TUTAJ, przed wykonaniem. To jest miejsce, w którym
 *    kliknięcie człowieka zamienia się w dowód: `createApproval` zapisuje
 *    migawkę tego, co klient widział na karcie. Przy reklamacji „ja tego nie
 *    wysyłałem" ta migawka jest odpowiedzią.
 *
 * 3. `reason: 'stale'` TO NORMALNY PRZYPADEK, NIE AWARIA. Kontrahent zapłacił
 *    między przygotowaniem karty a kliknięciem — agent zadziałał poprawnie,
 *    blokując wysyłkę. Interfejs pokazuje `message` spokojnym tonem
 *    i odświeża listę. Nigdy czerwonym komunikatem o błędzie.
 */

import { revalidatePath } from 'next/cache';

import { createApproval } from '@/lib/flo/approval';
import { floDb, type FloProposalRow } from '@/lib/flo/db-types';
import { muteKind, recordDecision } from '@/lib/flo/decisions';
import { executeProposal } from '@/lib/flo/execute';
// Skutek uboczny: rejestracja wykonawców propozycji. NIE USUWAĆ.
import '@/lib/flo/functions';
import { listOpen } from '@/lib/flo/proposals';
import { undoAction as undoProposalAction } from '@/lib/flo/undo';
// UWAGA: plik z dyrektywą 'use server' może eksportować WYŁĄCZNIE funkcje
// asynchroniczne. Klasy i funkcje synchroniczne (np. ActionAuthError,
// toProposalView) importuje się bezpośrednio z ich modułów — próba
// re-eksportu stąd wywala `next build`, choć typecheck jej nie łapie.
import { requireUserAndActiveOrg } from '@/lib/supabase/auth-context';
import type {
  FloApproveInput,
  FloApproveResult,
  FloDismissMode,
  FloPrefs,
  FloProposalView,
  FloScheduledView,
} from '@/types/flo';

// ═══════════════════════════════════════════════════════════════
// Odczyt
// ═══════════════════════════════════════════════════════════════

export async function listProposals(): Promise<FloProposalView[]> {
  const { tenantId } = await requireUserAndActiveOrg();
  return listOpen(tenantId);
}

/**
 * Panel „Zatwierdzone — czeka na wykonanie".
 *
 * INWARIANT: trafia tu WYŁĄCZNIE to, co człowiek już zatwierdził kliknięciem.
 * Dlatego czytamy propozycje o statusie `approved` i każdą podpisujemy datą
 * zatwierdzenia. Pozycja bez `approved_at` nie ma prawa się tu pojawić —
 * byłaby zgodą przez milczenie, czyli modelem, który został odrzucony.
 */
export async function listScheduled(): Promise<FloScheduledView[]> {
  const { tenantId } = await requireUserAndActiveOrg();

  const { data, error } = await floDb()
    .from('flo_proposals')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'approved')
    .order('approved_at', { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => row.approved_at !== null)
    .map((row) => ({
      id: row.id,
      label: row.title,
      whenLabel: 'zaraz',
      approvedAtLabel: `zatwierdzone ${formatWhen(row.approved_at!)}`,
      cancelLabel: 'Wstrzymaj',
    }));
}

// ═══════════════════════════════════════════════════════════════
// Decyzje
// ═══════════════════════════════════════════════════════════════

/**
 * Zatwierdzenie propozycji: żeton zgody, potem wykonanie.
 *
 * Kolejność jest nienegocjowalna. Żeton musi istnieć PRZED wykonaniem, bo
 * to on jest dowodem zgody — a funkcje wychodzące odmawiają działania bez
 * niego. Migawka zapisuje dokładnie to, co człowiek miał na ekranie:
 * tytuł, treść i dane akcji.
 */
export async function approveProposal(
  id: string,
  input?: FloApproveInput,
): Promise<FloApproveResult> {
  const { tenantId, user } = await requireUserAndActiveOrg();

  const loaded = await floDb()
    .from('flo_proposals')
    .select('*')
    .eq('id', id)
    // Filtr po organizacji to druga linia obrony obok RLS: klient administracyjny
    // omija polityki, więc przynależność sprawdzamy tu jawnie.
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (loaded.error) throw new Error(loaded.error.message);
  const proposal = loaded.data as FloProposalRow | null;

  if (!proposal) {
    return {
      ok: false,
      reason: 'expired',
      message: 'Tej propozycji już nie ma.',
    };
  }

  let approvalId: string;
  try {
    approvalId = await createApproval({
      proposalId: id,
      tenantId,
      userId: user.id,
      snapshot: {
        title: proposal.title,
        body: proposal.body,
        kind: proposal.kind,
        payload: proposal.payload,
        // Co klient wpisał albo zaznaczył, klikając.
        input: input ?? null,
        clickedAt: new Date().toISOString(),
      },
    });
  } catch {
    // Żeton już istnieje i jest zużyty — czyli ktoś kliknął przed nami.
    return {
      ok: false,
      reason: 'blocked',
      message: 'Ta sprawa jest już w toku.',
    };
  }

  const result = await executeProposal({
    proposalId: id,
    userId: user.id,
    approvalId,
    input,
  });

  revalidatePath('/flo');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard');
  return result;
}

/**
 * Odrzucenie propozycji.
 *
 * `not_now` odkłada sprawę, `never` wycisza rodzaj NATYCHMIAST. To drugie
 * nie jest kolejnym odrzuceniem w liczniku, tylko jasną prośbą — czekanie
 * z ciszą do następnego razu byłoby ignorowaniem tego, co człowiek
 * właśnie powiedział.
 */
export async function dismissProposal(
  id: string,
  mode: FloDismissMode,
): Promise<void> {
  const { tenantId } = await requireUserAndActiveOrg();
  const db = floDb();

  const loaded = await db
    .from('flo_proposals')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (loaded.error) throw new Error(loaded.error.message);
  const proposal = loaded.data as FloProposalRow | null;
  if (!proposal) return;

  const { error } = await db
    .from('flo_proposals')
    .update({ status: 'dismissed', dismissed_reason: mode })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) throw new Error(error.message);

  if (mode === 'never') {
    await muteKind(tenantId, proposal.kind);
  } else {
    await recordDecision(tenantId, proposal.kind, 'dismissed');
  }

  revalidatePath('/flo');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard');
}

/** Cofnięcie czynności, którą agent wykonał sam. Okno: dziesięć minut. */
export async function undoAction(proposalId: string): Promise<{
  ok: boolean;
  message?: string;
}> {
  const { tenantId, user } = await requireUserAndActiveOrg();

  const owned = await floDb()
    .from('flo_proposals')
    .select('id')
    .eq('id', proposalId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (owned.error) throw new Error(owned.error.message);
  if (!owned.data) return { ok: false, message: 'Tej zmiany nie da się cofnąć.' };

  const result = await undoProposalAction(proposalId, user.id);

  revalidatePath('/flo');
  revalidatePath('/dashboard');
  revalidatePath('/expenses');

  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

/**
 * „Wstrzymaj" z panelu zatwierdzonych.
 *
 * Propozycja WRACA DO WĄTKU jako otwarta, a nie znika. Klient wstrzymał
 * wykonanie, ale sprawa nadal istnieje — skasowanie jej byłoby podjęciem
 * za niego drugiej decyzji, o którą nie prosił.
 */
export async function cancelScheduled(id: string): Promise<void> {
  const { tenantId } = await requireUserAndActiveOrg();

  const { error } = await floDb()
    .from('flo_proposals')
    .update({ status: 'open', approved_at: null, approved_by: null })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', 'approved');

  if (error) throw new Error(error.message);

  revalidatePath('/flo');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard');
}

// ═══════════════════════════════════════════════════════════════
// Ustawienia
// ═══════════════════════════════════════════════════════════════

const DEFAULT_PREFS: Omit<FloPrefs, 'mutedKinds' | 'taxProfile'> = {
  pushEnabled: true,
  emailEnabled: true,
  quietFrom: '21:00',
  quietTo: '07:30',
};

export async function getPrefs(): Promise<FloPrefs> {
  const { tenantId } = await requireUserAndActiveOrg();

  const { data, error } = await floDb()
    .from('flo_prefs')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    return { ...DEFAULT_PREFS, mutedKinds: [], taxProfile: null };
  }

  return {
    pushEnabled: data.push_enabled,
    emailEnabled: data.email_enabled,
    quietFrom: String(data.quiet_from).slice(0, 5),
    quietTo: String(data.quiet_to).slice(0, 5),
    mutedKinds: (data.muted_kinds ?? []) as FloPrefs['mutedKinds'],
    taxProfile: data.tax_profile,
  };
}

/**
 * Zapis ustawień.
 *
 * Cztery kanały i profil podatkowy. NIE MA TU I NIE BĘDZIE poziomu autonomii
 * ani przełącznika „wysyłaj automatycznie" czegokolwiek — zachowanie agenta
 * jest identyczne u każdego klienta. Gdyby kiedyś ktoś poprosił o taki
 * przełącznik, odpowiedź brzmi nie, a powód stoi w części II.3 planu.
 */
export async function savePrefs(next: Partial<FloPrefs>): Promise<void> {
  const { tenantId } = await requireUserAndActiveOrg();
  const current = await getPrefs();

  const { error } = await floDb().from('flo_prefs').upsert(
    {
      tenant_id: tenantId,
      push_enabled: next.pushEnabled ?? current.pushEnabled,
      email_enabled: next.emailEnabled ?? current.emailEnabled,
      quiet_from: next.quietFrom ?? current.quietFrom,
      quiet_to: next.quietTo ?? current.quietTo,
      muted_kinds: next.mutedKinds ?? current.mutedKinds,
      tax_profile: next.taxProfile ?? current.taxProfile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );

  if (error) throw new Error(error.message);
  revalidatePath('/settings/flo');
}

// ═══════════════════════════════════════════════════════════════
// Pomocnicze
// ═══════════════════════════════════════════════════════════════

/**
 * „dziś 11:42" — data w strefie klienta, nie serwera.
 *
 * Kontenery chodzą w UTC. Bez jawnej strefy zatwierdzenie z 00:30 czasu
 * polskiego pokazałoby się jako wczorajsze — a to jest ślad zgody, który
 * przy reklamacji musi się zgadzać co do dnia.
 */
function formatWhen(iso: string): string {
  const when = new Date(iso);
  const time = when.toLocaleTimeString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
  });

  const day = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Warsaw',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

  if (day(when) === day(new Date())) return `dziś ${time}`;
  return `${when.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })} o ${time}`;
}
