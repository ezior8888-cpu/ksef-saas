/**
 * Cykl życia propozycji agenta FLO (krok 7 planu).
 *
 * Propozycja to jedna karta w interfejsie i jednocześnie jedna decyzja do
 * podjęcia przez człowieka. Ten moduł odpowiada za jej powstanie, aktualizację,
 * wygasanie i zamianę na kształt, który rozumie interfejs.
 *
 * TRZY ZASADY WBUDOWANE W TEN PLIK:
 *
 * 1. JEDEN TEMAT = JEDNA KARTA. Nowa wiedza o tej samej sprawie aktualizuje
 *    istniejącą propozycję zamiast tworzyć drugą. Bez tego agent potrafiłby
 *    postawić obok siebie dwie karty mówiące co innego — a to koniec zaufania.
 *
 * 2. PROPOZYCJA MA TERMIN WAŻNOŚCI. Ponaglenie sprzed trzech dni opisuje
 *    świat, którego już nie ma. Po terminie karta znika sama i nie da się jej
 *    wykonać, nawet z zapisanego linku.
 *
 * 3. WYCISZENIE JEST RESPEKTOWANE PRZED ZAPISEM. Sprawdzamy je, zanim
 *    propozycja powstanie, a nie przy wyświetlaniu — inaczej baza puchłaby
 *    od kart, których nikt nigdy nie zobaczy.
 */

import {
  floDb,
  type FloProposalInsert,
  type FloProposalRow,
} from '@/lib/flo/db-types';
import { isMuted } from '@/lib/flo/decisions';
import { FLO_KIND_VARIANT } from '@/lib/flo/kind-variant';
import {
  isFloProposalKind,
  type FloAction,
  type FloEvidence,
  type FloListItem,
  type FloPreview,
  type FloProposalKind,
  type FloProposalView,
} from '@/types/flo';

// ═══════════════════════════════════════════════════════════════
// Tworzenie i aktualizacja
// ═══════════════════════════════════════════════════════════════

export interface CreateProposalInput {
  tenantId: string;
  kind: FloProposalKind;
  /** kontrahent + rodzaj + okres — klucz deduplikacji */
  topicKey: string;
  title: string;
  body: string;
  fingerprint: string;
  expiresAt: Date;
  priority?: number;
  payload?: Record<string, unknown>;
  evidence?: FloEvidence[];
}

export type CreateProposalResult =
  | { status: 'created'; id: string }
  | { status: 'updated'; id: string }
  | { status: 'muted' };

/**
 * Tworzy propozycję albo — gdy żywa propozycja tego samego tematu już
 * istnieje — aktualizuje ją w miejscu.
 *
 * Aktualizacja obejmuje treść, dowody i odcisk danych, ale NIE przywraca
 * karty do stanu „otwarta”, jeśli człowiek zdążył ją zatwierdzić. Zatwierdzona
 * propozycja czeka na wykonanie i nie wolno jej podmienić pod ręką — to byłaby
 * zgoda na jedną treść, a wykonanie innej.
 */
export async function createProposal(
  input: CreateProposalInput,
): Promise<CreateProposalResult> {
  if (await isMuted(input.tenantId, input.kind)) {
    return { status: 'muted' };
  }

  const db = floDb();

  const existing = await db
    .from('flo_proposals')
    .select('id, status')
    .eq('tenant_id', input.tenantId)
    .eq('topic_key', input.topicKey)
    .in('status', ['open', 'approved'])
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);

  if (existing.data) {
    if (existing.data.status === 'approved') {
      // Zgoda dotyczyła konkretnej treści — nie podmieniamy jej pod ręką.
      return { status: 'updated', id: existing.data.id };
    }

    const patch = await db
      .from('flo_proposals')
      .update({
        title: input.title,
        body: input.body,
        payload: input.payload ?? {},
        evidence: input.evidence ?? [],
        fingerprint: input.fingerprint,
        expires_at: input.expiresAt.toISOString(),
        priority: input.priority ?? 50,
      })
      .eq('id', existing.data.id);

    if (patch.error) throw new Error(patch.error.message);
    return { status: 'updated', id: existing.data.id };
  }

  const row: FloProposalInsert = {
    tenant_id: input.tenantId,
    kind: input.kind,
    topic_key: input.topicKey,
    title: input.title,
    body: input.body,
    fingerprint: input.fingerprint,
    expires_at: input.expiresAt.toISOString(),
    priority: input.priority ?? 50,
    payload: input.payload ?? {},
    evidence: input.evidence ?? [],
  };

  const inserted = await db
    .from('flo_proposals')
    .insert(row)
    .select('id')
    .maybeSingle();

  if (inserted.error) {
    // 23505 = wyścig: równoległy przebieg zdążył utworzyć tę samą propozycję
    // między naszym SELECT-em a INSERT-em. Unikalny indeks częściowy zadziałał
    // dokładnie tak, jak powinien — to nie jest awaria.
    if (isUniqueViolation(inserted.error)) {
      return { status: 'updated', id: '' };
    }
    throw new Error(inserted.error.message);
  }

  return { status: 'created', id: inserted.data?.id ?? '' };
}

/**
 * Oznacza przeterminowane propozycje. Wołane z crona `flo.tick`.
 *
 * Świadomie nie kasujemy wierszy: wygasła propozycja jest informacją o tym,
 * co agent widział i czego człowiek nie potrzebował. To materiał do pomiaru
 * trafności, a nie śmieć.
 */
export async function expireStale(now: Date = new Date()): Promise<number> {
  const db = floDb();

  const stale = await db
    .from('flo_proposals')
    .select('id')
    .in('status', ['open', 'approved'])
    .lt('expires_at', now.toISOString());

  if (stale.error) throw new Error(stale.error.message);
  const ids = (stale.data ?? []).map((r) => r.id);
  if (ids.length === 0) return 0;

  const patch = await db
    .from('flo_proposals')
    .update({ status: 'expired', dismissed_reason: 'auto_expired' })
    .in('id', ids);

  if (patch.error) throw new Error(patch.error.message);
  return ids.length;
}

// ═══════════════════════════════════════════════════════════════
// Odczyt
// ═══════════════════════════════════════════════════════════════

/**
 * Otwarte propozycje organizacji, w kolejności, w jakiej mają stać w wątku:
 * najpierw priorytet, potem czas. Kolejność wynika z wagi sprawy, nie
 * z momentu powstania — inaczej gratulacje za próg przychodu wypychałyby
 * w górę fakturę odrzuconą przez KSeF.
 */
export async function listOpen(tenantId: string): Promise<FloProposalView[]> {
  const db = floDb();

  const result = await db
    .from('flo_proposals')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['open', 'approved'])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50);

  if (result.error) throw new Error(result.error.message);

  return (result.data ?? [])
    .map((row) => toProposalView(row))
    .filter((view): view is FloProposalView => view !== null);
}

// ═══════════════════════════════════════════════════════════════
// Wiersz → widok (funkcja czysta, testowalna bez bazy)
// ═══════════════════════════════════════════════════════════════

/**
 * Zamienia wiersz bazy na jedyny kształt, jaki zna interfejs.
 *
 * Zwraca `null` dla wiersza, którego nie da się bezpiecznie wyświetlić —
 * nieznany rodzaj propozycji oznacza, że baza pamięta coś ze starszej wersji
 * kodu. Lepiej pominąć taką kartę niż narysować ją byle jak: cisza jest
 * dopuszczalna, bełkot nie.
 */
export function toProposalView(row: FloProposalRow): FloProposalView | null {
  if (!isFloProposalKind(row.kind)) return null;

  const kind: FloProposalKind = row.kind;
  const variant = FLO_KIND_VARIANT[kind];
  const payload = row.payload ?? {};

  return {
    id: row.id,
    kind,
    variant,
    title: row.title,
    body: row.body,
    evidence: readEvidence(row.evidence),
    primary: primaryAction(variant, payload),
    secondary: secondaryActions(variant, payload),
    preview: readPreview(payload),
    items: readItems(payload),
    expiresAt: row.expires_at,
    priority: row.priority,
    createdAt: row.created_at,
    undoableUntil: readString(payload.undoableUntil) ?? undefined,
  };
}

/**
 * Etykiety pochodzą na razie z ładunku propozycji, a domyślne z wariantu.
 * Krok 14 planu przeniesie je do szablonów w `lib/flo/copy.ts`, a treści
 * napisze tor interfejsu — do tego czasu te napisy są robocze.
 */
function primaryAction(
  variant: FloProposalView['variant'],
  payload: Record<string, unknown>,
): FloAction {
  const label = readString(payload.primaryLabel) ?? defaultPrimaryLabel(variant);

  if (variant === 'input') {
    return {
      label,
      intent: 'input',
      requiresPreview: true,
      inputLabel: readString(payload.inputLabel) ?? 'Uzupełnij dane',
      inputKind: readInputKind(payload.inputKind),
    };
  }

  return {
    label,
    intent: variant === 'info' ? 'open' : 'approve',
    // Promień rażenia 4: nie da się kliknąć, nie widząc, co poleci.
    requiresPreview: variant === 'preview' ? true : undefined,
  };
}

function defaultPrimaryLabel(variant: FloProposalView['variant']): string {
  switch (variant) {
    case 'info':
      return 'Pokaż';
    case 'preview':
      return 'Pokaż treść';
    case 'list':
      return 'Wyślij zaznaczone';
    case 'choice':
      return 'Tak';
    case 'input':
      return 'Wyślij';
    default:
      return 'Zgadza się';
  }
}

function secondaryActions(
  variant: FloProposalView['variant'],
  payload: Record<string, unknown>,
): FloAction[] {
  const custom = readActions(payload.secondary);
  if (custom) return custom;

  // Karta bez akcji ma tylko „ukryj” — proponowanie „nigdy więcej takich”
  // przy zwykłym meldunku brzmiałoby jak zniechęcanie do własnego produktu.
  if (variant === 'info') {
    return [{ label: 'Ukryj', intent: 'dismiss' }];
  }

  return [
    { label: 'Nie teraz', intent: 'snooze' },
    { label: 'Nigdy więcej takich', intent: 'mute' },
  ];
}

// ═══════════════════════════════════════════════════════════════
// Bezpieczne odczyty z JSONB
// ═══════════════════════════════════════════════════════════════

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readInputKind(value: unknown): 'email' | 'text' | 'amount' {
  return value === 'email' || value === 'amount' ? value : 'text';
}

function readEvidence(value: unknown): FloEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const label = readString(record.label);
    const href = readString(record.href);
    return label && href ? [{ label, href }] : [];
  });
}

function readActions(value: unknown): FloAction[] | null {
  if (!Array.isArray(value)) return null;
  const actions = value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const label = readString(record.label);
    const intent = record.intent;
    const valid =
      intent === 'approve' ||
      intent === 'dismiss' ||
      intent === 'snooze' ||
      intent === 'mute' ||
      intent === 'input' ||
      intent === 'open';
    return label && valid ? [{ label, intent } as FloAction] : [];
  });
  return actions.length > 0 ? actions : null;
}

function readPreview(payload: Record<string, unknown>): FloPreview | undefined {
  const preview = payload.preview;
  if (typeof preview !== 'object' || preview === null) return undefined;
  const record = preview as Record<string, unknown>;

  switch (record.type) {
    case 'invoice':
    case 'message':
    case 'diff':
    case 'file':
      // Kształt buduje ten, kto tworzy propozycję; tutaj pilnujemy tylko,
      // żeby nieznany typ podglądu nie trafił do interfejsu.
      return preview as FloPreview;
    default:
      return undefined;
  }
}

function readItems(payload: Record<string, unknown>): FloListItem[] | undefined {
  const items = payload.items;
  if (!Array.isArray(items)) return undefined;

  const parsed = items.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const id = readString(record.id);
    const label = readString(record.label);
    const amount = readString(record.amount);
    if (!id || !label || !amount) return [];

    const needsPreview = record.needsPreview === true;
    return [
      {
        id,
        label,
        sublabel: readString(record.sublabel) ?? '',
        amount,
        // Pozycja wymagająca podglądu NIE MOŻE być zaznaczona z góry —
        // to jedyna rzecz, która powstrzymuje hurtową wysyłkę pozycji
        // odbiegających od normy.
        preselected: needsPreview ? false : record.preselected === true,
        needsPreview,
      },
    ];
  });

  return parsed.length > 0 ? parsed : undefined;
}

function isUniqueViolation(error: { message: string } & { code?: string }) {
  return (
    error.code === '23505' ||
    error.message.includes('duplicate key value violates unique constraint')
  );
}
