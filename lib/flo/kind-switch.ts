/**
 * M8 — przełączniki funkcji agenta (krok 53 planu).
 *
 * TRZY WARSTWY, W KOLEJNOŚCI OD NAJMOCNIEJSZEJ. Kolejność jest tu całą
 * treścią: każda następna warstwa może tylko ZABRAĆ, nigdy dodać.
 *
 * 1. GLOBALNY WYŁĄCZNIK AGENTA (`killFloAgent` w `global_feature_flags`).
 *    Jedna wartość w bazie, odczyt z cache o czasie życia minuty, żadnego
 *    wdrożenia. To jest pierwszy krok runbooku incydentowego: trzydzieści
 *    sekund od decyzji do ciszy.
 *
 * 2. BLOKADA W KODZIE (`lib/flo/flags.ts`). Funkcje czekające na opinię
 *    prawnika albo na potwierdzenie danych. Włączenie wymaga commita
 *    z uzasadnieniem i przeglądu kodu.
 *
 * 3. PRZEŁĄCZNIK PER KONTO (`flo_kind_flags`, migracja 00066). Wiersz
 *    powstaje wyłącznie przy odstępstwie; konto bez wierszy ma wszystko
 *    włączone. Wpis operatora jest OSTATECZNY — jeżeli istnieje, kanarek
 *    już nie decyduje. Inaczej nie dałoby się wpuścić konkretnego konta
 *    do wczesnego dostępu ani wypisać kogoś, kto poprosił.
 *
 * 4. KANAREK (`flo_rollout`, migracja 00067). Funkcje promienia 4 idą przez
 *    10% kont, potem 50%, potem 100%. Rodzaj bez wiersza w tej tabeli jest
 *    dla kanarka nieodsłonięty — ale kanarek dotyczy WYŁĄCZNIE rodzajów
 *    z listy `ROLLOUT_ORDER`. Reszta działa bez niego, bo ich pomyłka
 *    zostaje wewnątrz konta.
 *
 * NAJWAŻNIEJSZA WŁASNOŚĆ CAŁEGO PLIKU: WARSTWA 3 NIE MOŻE ODWRÓCIĆ WARSTWY 2.
 * Wpis `enabled = true` dla rodzaju zablokowanego w kodzie jest ignorowany.
 * Gdyby było inaczej, jeden UPDATE o drugiej w nocy wypuszczałby na klienta
 * funkcję, której nikt nie zatwierdził — a właśnie przed tym miało chronić
 * trzymanie tamtej listy w commicie, a nie w tabeli.
 */

import { getGlobalFlag } from '@/lib/feature-flags/global-flags';
import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import { kindStatus, type FloKindStatus } from '@/lib/flo/flags';
import { isInCanary, readRollout, ROLLOUT_ORDER } from '@/lib/flo/rollout';
import type { FloProposalKind } from '@/types/flo';

export type SwitchLayer =
  | 'global_kill'
  | 'code_block'
  | 'tenant_override'
  | 'canary';

export interface SwitchVerdict {
  enabled: boolean;
  /** Która warstwa zdecydowała; `null` = domyślnie włączone. */
  decidedBy: SwitchLayer | null;
  /** Zdanie dla operatora — dlaczego to jest wyłączone. */
  note?: string;
}

/**
 * Rozstrzygnięcie trzech warstw — funkcja czysta.
 *
 * Wydzielona z odczytów, żeby dało się przetestować każdą kombinację bez
 * bazy i bez cache — a kombinacji jest tu dokładnie tyle, ile trzeba, żeby
 * ktoś kiedyś pomylił kolejność.
 */
export function resolveSwitch(input: {
  globalKill: boolean;
  codeStatus: FloKindStatus;
  /** `undefined` = brak wiersza dla tego konta. */
  tenantOverride?: { enabled: boolean; reason: string | null };
  /** `undefined` = rodzaj nie podlega wdrożeniu kanarkowemu. */
  canary?: { inCanary: boolean; stage: number };
}): SwitchVerdict {
  if (input.globalKill) {
    return {
      enabled: false,
      decidedBy: 'global_kill',
      note: 'Agent zatrzymany globalnie (killFloAgent).',
    };
  }

  // Blokada w kodzie stoi NAD kontem. Wpis `enabled = true` dla rodzaju
  // zablokowanego prawnie jest ignorowany — świadomie i bez wyjątków.
  if (!input.codeStatus.enabled) {
    return {
      enabled: false,
      decidedBy: 'code_block',
      note: input.codeStatus.note,
    };
  }

  // Wpis operatora jest OSTATECZNY: przebija kanarka w obie strony.
  // Bez tego nie dałoby się wpuścić testera do wczesnego dostępu ani
  // wypisać klienta, który poprosił o wyłączenie.
  if (input.tenantOverride) {
    return {
      enabled: input.tenantOverride.enabled,
      decidedBy: 'tenant_override',
      note: input.tenantOverride.reason ?? undefined,
    };
  }

  if (input.canary && !input.canary.inCanary) {
    return {
      enabled: false,
      decidedBy: 'canary',
      note: `Funkcja odsłonięta na ${input.canary.stage}% kont — to konto jeszcze nie w tej grupie.`,
    };
  }

  return { enabled: true, decidedBy: null };
}

// ═══════════════════════════════════════════════════════════════
// Odczyt
// ═══════════════════════════════════════════════════════════════

/**
 * Czy wolno utworzyć propozycję tego rodzaju na tym koncie.
 *
 * Wołane PRZED zapisem, tak samo jak wyciszenie: funkcja wyłączona nie ma
 * zostawiać śladu w bazie klienta, bo po ponownym włączeniu wysypałaby się
 * na niego lawina kart sprzed tygodni.
 */
export async function isKindEnabledForTenant(
  kind: FloProposalKind,
  tenantId: string,
  db: FloDbClient = floDb(),
  /**
   * Odczyt globalnego wyłącznika. Wstrzykiwany WYŁĄCZNIE po to, żeby testy
   * jednostkowe nie sięgały po cache i po bazę flag — produkcyjnie zawsze
   * idzie prawdziwy odczyt.
   */
  readGlobalKill: () => Promise<boolean> = () => getGlobalFlag('killFloAgent'),
): Promise<SwitchVerdict> {
  const codeStatus = kindStatus(kind);

  // Gdy kod i tak blokuje, nie ma po co pytać bazy ani cache'u flag.
  if (!codeStatus.enabled) {
    return resolveSwitch({ globalKill: false, codeStatus });
  }

  const globalKill = await readGlobalKill();
  if (globalKill) {
    return resolveSwitch({ globalKill: true, codeStatus });
  }

  const { data, error } = await db
    .from('flo_kind_flags')
    .select('enabled, reason')
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const override = data
    ? { enabled: data.enabled, reason: data.reason }
    : undefined;

  // Kanarka pytamy tylko wtedy, gdy rodzaj mu podlega I gdy nie ma wpisu
  // operatora — inaczej byłoby to zapytanie, którego wynik i tak nic nie zmienia.
  const underCanary =
    !override && ROLLOUT_ORDER.some((entry) => entry.kind === kind);

  if (underCanary) {
    const rollout = await readRollout(kind, db);
    return resolveSwitch({
      globalKill: false,
      codeStatus,
      canary: {
        inCanary: isInCanary(rollout, tenantId),
        stage: rollout?.stage ?? 0,
      },
    });
  }

  return resolveSwitch({ globalKill: false, codeStatus, tenantOverride: override });
}

// ═══════════════════════════════════════════════════════════════
// Ustawianie
// ═══════════════════════════════════════════════════════════════

/**
 * Wyłączenie funkcji na jednym koncie.
 *
 * POWÓD JEST OBOWIĄZKOWY. Wyłącznik bez powodu po pół roku jest nie do
 * odróżnienia od pomyłki i nikt nie odważy się go cofnąć — a wtedy klient
 * zostaje bez funkcji na zawsze, bo raz komuś coś nie zadziałało.
 */
export async function setKindForTenant(
  input: {
    tenantId: string;
    kind: FloProposalKind;
    enabled: boolean;
    reason: string;
  },
  db: FloDbClient = floDb(),
): Promise<void> {
  if (input.reason.trim().length < 5) {
    throw new Error('Przełącznik funkcji wymaga powodu.');
  }

  const { error } = await db.from('flo_kind_flags').upsert(
    {
      tenant_id: input.tenantId,
      kind: input.kind,
      enabled: input.enabled,
      reason: input.reason.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,kind' },
  );

  if (error) throw new Error(error.message);
}

/** Co jest ustawione inaczej niż domyślnie — do panelu operatora. */
export async function listTenantOverrides(
  tenantId: string,
  db: FloDbClient = floDb(),
): Promise<Array<{ kind: string; enabled: boolean; reason: string | null }>> {
  const { data, error } = await db
    .from('flo_kind_flags')
    .select('kind, enabled, reason')
    .eq('tenant_id', tenantId);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    kind: row.kind,
    enabled: row.enabled,
    reason: row.reason,
  }));
}
