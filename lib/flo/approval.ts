/**
 * Żeton zgody (krok 8 planu agenta FLO).
 *
 * TO JEST NAJWAŻNIEJSZY PLIK W CAŁYM AGENCIE.
 *
 * Własność, którą wymusza: NIC NIE WYCHODZI NA ZEWNĄTRZ BEZ KLIKNIĘCIA
 * CZŁOWIEKA. Każda funkcja wychodząca — wysyłka faktury do KSeF, wiadomość do
 * kontrahenta, paczka do księgowej — przyjmuje obowiązkowy `approvalId`
 * i sprawdza go tutaj. Brak żetonu to wyjątek, nigdy „domyślne przepuszczenie”.
 *
 * Dlaczego to nie jest przesada: agent, który się myli i pyta, jest do
 * zniesienia. Agent, który się myli i działa, kończy firmę klienta i naszą.
 * Ponaglenie wysłane komuś, kto zapłacił trzy dni temu, kompromituje klienta
 * przed jego własnym kontrahentem — i winą obciąży narzędzie, nie siebie.
 *
 * Żeton musi istnieć, dotyczyć tej firmy, osoby i wersji operacji,
 * nie być zużyty ani przeterminowany. Zużycie jest atomowe
 * (jeden UPDATE z warunkami), więc dwa równoległe kliknięcia nie przepuszczą
 * dwóch wysyłek.
 */

import { floDb, type FloApprovalRow, type FloDbClient } from '@/lib/flo/db-types';
import { approvalOperationHash, hasApprovalBinding, isApprovalVersion, parseApprovalInput } from './approval-version';
import type { FloApproveInput } from '@/types/flo';

// ═══════════════════════════════════════════════════════════════
// Błędy
// ═══════════════════════════════════════════════════════════════

export type FloApprovalDenial =
  | 'missing' // w ogóle nie podano żetonu
  | 'not_found' // żeton nie istnieje
  | 'wrong_proposal' // żeton dotyczy innej sprawy
  | 'already_used' // ktoś już go zużył
  | 'version_changed'
  | 'expired'; // zgoda sprzed pół godziny nie jest zgodą na teraz

export class FloApprovalError extends Error {
  readonly reason: FloApprovalDenial;

  constructor(reason: FloApprovalDenial, message: string) {
    super(message);
    this.name = 'FloApprovalError';
    this.reason = reason;
  }
}

/** Komunikaty po polsku — trafiają do dziennika i do zgłoszeń wsparcia. */
const DENIAL_MESSAGE: Record<FloApprovalDenial, string> = {
  version_changed: 'Zgoda dotyczy innej wersji lub danych operacji. Sprawdź propozycję i zatwierdź ponownie.',
  missing: 'Brak zgody człowieka — odmawiam wykonania.',
  not_found: 'Zgoda nie istnieje albo została już usunięta.',
  wrong_proposal: 'Zgoda dotyczy innej sprawy niż ta, którą próbuję wykonać.',
  already_used: 'Ta zgoda została już zużyta — nie wykonam tego drugi raz.',
  expired: 'Zgoda wygasła. Poproś o nią ponownie, świat mógł się zmienić.',
};

// ═══════════════════════════════════════════════════════════════
// Strażnik dla funkcji wychodzących
// ═══════════════════════════════════════════════════════════════

/**
 * Pierwsza linia obrony: sam fakt, że ktoś podał żeton.
 *
 * Świadomie osobna od `consumeApproval`, bo działa bez bazy — dzięki temu
 * da się jej użyć na samym wejściu zadania w kolejce, zanim cokolwiek
 * zostanie pobrane, i dzięki temu jest testowalna bez Postgresa.
 */
export function requireApprovalId(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FloApprovalError(
      'missing',
      `${context}: ${DENIAL_MESSAGE.missing}`,
    );
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════
// Ocena żetonu — funkcja czysta, sedno logiki
// ═══════════════════════════════════════════════════════════════

/**
 * Czy tym żetonem wolno wykonać tę propozycję.
 *
 * Wydzielone z operacji bazodanowej celowo: to jest reguła, a reguły testuje
 * się bez bazy. `consumeApproval` używa tego do zbudowania precyzyjnego
 * komunikatu, gdy atomowy UPDATE niczego nie zmienił.
 */
export function evaluateApproval(
  row: FloApprovalRow | null,
  expectedProposalId: string,
  now: Date = new Date(),
): FloApprovalDenial | 'ok' {
  if (!row) return 'not_found';
  if (row.proposal_id !== expectedProposalId) return 'wrong_proposal';
  if (row.consumed_at !== null) return 'already_used';
  if (!Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= now.getTime()) return 'expired';
  return 'ok';
}

// ═══════════════════════════════════════════════════════════════
// Zapis i zużycie
// ═══════════════════════════════════════════════════════════════

export interface CreateApprovalInput {
  proposalId: string;
  tenantId: string;
  userId: string;
  /**
   * Dokładnie to, co człowiek widział, klikając: tytuł, treść, kwoty,
   * adresat, podgląd. Przy reklamacji „ja tego nie wysyłałem” to jest dowód,
   * a nie nasze słowo przeciwko jego słowu.
   */
  snapshot: Record<string, unknown>;
  ttlMinutes?: number;
}

/**
 * Wystawia żeton zgody.
 *
 * Podwójne kliknięcie nie tworzy dwóch żetonów: unikalny indeks częściowy
 * `flo_approvals_live` (migracja 00061) na to nie pozwala, a my w takiej
 * sytuacji zwracamy żeton już istniejący. Efekt: druga próba trafia na ten
 * sam identyfikator, a zużycie i tak wykona się raz.
 */
export async function createApproval(
  input: CreateApprovalInput,
  db: FloDbClient = floDb(),
): Promise<string> {
  const version = input.snapshot.proposalVersion;
  const approvedInput = parseApprovalInput(input.snapshot.input ?? undefined);
  if (!isApprovalVersion(version) || !hasApprovalBinding(input.snapshot, version, approvedInput)) {
    throw new FloApprovalError('version_changed', DENIAL_MESSAGE.version_changed);
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMinutes ?? 30) * 60_000).toISOString();

  // The partial unique index includes expired tokens. Retire those first;
  // a live token issued by another user must never be reused or overwritten.
  const expired = await db.from('flo_approvals')
    .update({ consumed_at: now.toISOString() })
    .eq('proposal_id', input.proposalId).eq('tenant_id', input.tenantId)
    .is('consumed_at', null).lte('expires_at', now.toISOString());
  if (expired.error) throw new Error('Nie udało się przygotować zgody.');

  for (let attempt = 0; attempt < 2; attempt++) {
    const inserted = await db.from('flo_approvals').insert({
      proposal_id: input.proposalId, tenant_id: input.tenantId, user_id: input.userId,
      snapshot: input.snapshot, expires_at: expiresAt,
    }).select('id').maybeSingle();
    if (!inserted.error && inserted.data) return inserted.data.id;
    if (inserted.error && !isUniqueViolation(inserted.error)) {
      throw new Error('Nie udało się zapisać zgody.');
    }

    const existing = await db.from('flo_approvals').select('*')
      .eq('proposal_id', input.proposalId).eq('tenant_id', input.tenantId)
      .eq('user_id', input.userId).is('consumed_at', null).maybeSingle();
    if (existing.error) throw new Error('Nie udało się sprawdzić zgody.');
    if (!existing.data) break;
    if (hasApprovalBinding(existing.data.snapshot, version, approvedInput) &&
        Date.parse(existing.data.expires_at) > now.getTime()) {
      return existing.data.id;
    }
    // Preserve the old snapshot for audit. A new click can authorize the new
    // operation, but the old token can never authorize the new content/input.
    const retired = await db.from('flo_approvals').update({ consumed_at: now.toISOString() })
      .eq('id', existing.data.id).eq('proposal_id', input.proposalId)
      .eq('tenant_id', input.tenantId).eq('user_id', input.userId)
      .is('consumed_at', null);
    if (retired.error) throw new Error('Nie udało się odwołać poprzedniej zgody.');
  }
  throw new FloApprovalError('already_used', DENIAL_MESSAGE.already_used);
}

/**
 * Zużywa żeton i zwraca migawkę tego, co człowiek zatwierdzał.
 *
 * Zużycie jest ATOMOWE — tożsamość, wersja, dane i ważność są w jednym UPDATE.
 * Gdyby sprawdzać je osobno przed zapisem, między sprawdzeniem a zapisem
 * mieściłby się wyścig, w którym dwa równoległe kliknięcia przepuszczają
 * dwie wysyłki tej samej faktury do rejestru państwowego.
 */
export async function consumeApproval(
  approvalId: string,
  expectedProposalId: string,
  expectedTenantId: string,
  expectedUserId: string,
  expectedVersion: string,
  expectedInput: FloApproveInput | undefined,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<Record<string, unknown>> {
  const nowIso = now.toISOString();

  const claimed = await db
    .from('flo_approvals')
    .update({ consumed_at: nowIso })
    .eq('id', approvalId)
    .eq('proposal_id', expectedProposalId)
    .eq('tenant_id', expectedTenantId)
    .eq('user_id', expectedUserId)
    .eq('snapshot->>approvalVersion', '1')
    .eq('snapshot->>proposalVersion', expectedVersion)
    .eq('snapshot->>operationHash', approvalOperationHash(expectedVersion, expectedInput))
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .select('*');

  if (claimed.error) throw new Error('Nie udało się sprawdzić zgody.');

  const row = (claimed.data ?? [])[0];
  if (row && hasApprovalBinding(row.snapshot, expectedVersion, expectedInput)) return row.snapshot;

  // UPDATE nic nie zmienił — dociekamy dlaczego, żeby komunikat był konkretny.
  // „Coś poszło nie tak” w tym miejscu jest bezużyteczne i dla klienta,
  // i dla nas przy zgłoszeniu.
  const lookup = await db
    .from('flo_approvals')
    .select('*')
    .eq('id', approvalId)
    .eq('tenant_id', expectedTenantId)
    .eq('user_id', expectedUserId)
    .maybeSingle();

  if (lookup.error) throw new Error('Nie udało się sprawdzić zgody.');

  const reason = evaluateApproval(lookup.data, expectedProposalId, now);
  throw new FloApprovalError(
    reason === 'ok' ? 'version_changed' : reason,
    DENIAL_MESSAGE[reason === 'ok' ? 'version_changed' : reason],
  );
}

function isUniqueViolation(error: { message: string } & { code?: string }) {
  return (
    error.code === '23505' ||
    error.message.includes('duplicate key value violates unique constraint')
  );
}
