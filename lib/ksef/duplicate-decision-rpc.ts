/**
 * Wywołania RPC decyzji klienta przy nierozstrzygniętym 440 (00148,
 * D-A4-1b-3 PR B): `decide_ksef_duplicate` i `ksef_duplicate_decision_blocker`.
 * Obie funkcje mają GRANT tylko dla `service_role` — klient serwisowy, po
 * autoryzacji wywołującego (`requireAdmin()` operatora albo job).
 *
 * Typy bazy (`types/database.ts`) generujemy z produkcji po wgraniu migracji
 * (AGENTS.md: „Typy bazy po migracji”), w kolejnym PR. Do tego czasu JEDNO
 * udokumentowane rzutowanie klienta poniżej — metoda wołana na obiekcie, żeby
 * zachować `this` klienta supabase-js.
 */

import 'server-only';

import type { createAdminClient } from '@/lib/supabase/admin';

import type { DuplicateDecisionChoice, DuplicateDecisionVia } from './duplicate-check';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Błąd PostgREST (kod Postgresa i komunikat — P0001 to tekst dla klienta z 00148). */
export interface DuplicateRpcError {
  code?: string;
  message?: string;
}

type UntypedRpcClient = {
  rpc: (
    fn: 'decide_ksef_duplicate' | 'ksef_duplicate_decision_blocker',
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: DuplicateRpcError | null }>;
};

/** Rzutowanie do czasu regeneracji typów po 00148 (jedyne w tym module). */
const untyped = (admin: AdminClient): UntypedRpcClient => admin as unknown as UntypedRpcClient;

export interface DecideKsefDuplicateArgs {
  invoiceId: string;
  tenantId: string;
  actorUserId: string;
  choice: DuplicateDecisionChoice;
  via: DuplicateDecisionVia;
  /** K pokazany klientowi (wiązanie). */
  originalKsefNumber: string;
  /** SHA-256 danych oryginału pokazanych klientowi (wiązanie). */
  originalSha256: string;
  /** `configuredKsefEnvironment()` serwera. */
  env: string;
  /** Notatka operatora (kanał, data, osoba); klient — `null`. */
  note: string | null;
}

/** Wynik RPC (2.1.3 (f)). */
export interface DecideKsefDuplicateResult {
  invoice_id: string;
  internal_number: string | null;
  original_ksef_number: string;
  choice: DuplicateDecisionChoice;
  via: DuplicateDecisionVia;
  reason: string | null;
  /** Ta sama decyzja była już zapisana (ponowienie po zgubionej odpowiedzi) — bez zapisów i audytu. */
  already_decided: boolean;
  submissions_closed: number;
}

/** `decide_ksef_duplicate` z dziewięcioma nazwanymi parametrami (00148). */
export async function callDecideKsefDuplicate(
  admin: AdminClient,
  args: DecideKsefDuplicateArgs,
): Promise<{ data: DecideKsefDuplicateResult | null; error: DuplicateRpcError | null }> {
  const { data, error } = await untyped(admin).rpc('decide_ksef_duplicate', {
    p_invoice_id: args.invoiceId,
    p_tenant_id: args.tenantId,
    p_actor_user_id: args.actorUserId,
    p_choice: args.choice,
    p_via: args.via,
    p_original_ksef_number: args.originalKsefNumber,
    p_original_sha256: args.originalSha256,
    p_env: args.env,
    p_note: args.note,
  });
  if (error) return { data: null, error };
  return { data: (data as DecideKsefDuplicateResult | null) ?? null, error: null };
}

/**
 * `ksef_duplicate_decision_blocker` — pierwszy powód, dla którego faktura nie
 * czeka na decyzję klienta (`null` = czeka). Odczyt autorytatywny: obejmuje
 * wiersze `payments`, których sesja klienta nie widzi. Rzuca przy błędzie
 * (fail-closed: „nie wiem” to nie „czeka na klienta”).
 */
export async function readDuplicateDecisionBlocker(
  admin: AdminClient,
  invoiceId: string,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await untyped(admin).rpc('ksef_duplicate_decision_blocker', {
    p_invoice_id: invoiceId,
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(`ksef_duplicate_decision_blocker: ${error.message ?? error.code ?? 'błąd bazy'}`);
  return typeof data === 'string' && data.length > 0 ? data : null;
}
