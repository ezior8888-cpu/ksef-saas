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
 *
 * D-A4-1b-3 PR C (00149): `decide_ksef_duplicate_original`,
 * `release_ksef_original_review`, `flag_ksef_original_recheck` (service_role)
 * i `ksef_duplicate_decision_blocker_for_session` (sesja klienta, 4.9).
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { createAdminClient } from '@/lib/supabase/admin';

import type {
  DuplicateDecisionChoice,
  DuplicateDecisionMode,
  DuplicateDecisionVia,
  DuplicateOriginalOffer,
  OriginalRecheckKind,
} from './duplicate-check';
import type { OriginalImportProblem, KsefOriginalImportProjection } from './duplicate-original-projection';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Błąd PostgREST (kod Postgresa i komunikat — P0001 to tekst dla klienta z 00148). */
export interface DuplicateRpcError {
  code?: string;
  message?: string;
  /** PR C: PostgREST `details` = `DETAIL` odmowy z 00149 (`mode`, `offer`, `choice`, `already`, `import-mismatch:<kod>`…). */
  details?: string;
}

type UntypedRpcClient = {
  rpc: (
    fn:
      | 'decide_ksef_duplicate'
      | 'ksef_duplicate_decision_blocker'
      // PR C (00149) — rzutowanie zostaje dla nich do typów z produkcji po wgraniu 00149 (8.6).
      | 'decide_ksef_duplicate_original'
      | 'release_ksef_original_review'
      | 'flag_ksef_original_recheck'
      | 'ksef_duplicate_decision_blocker_for_session',
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

// ─── PR C (00149) — sygnatury kontraktu (commit 1); ciała: commit 6 (grupa C) ──

/**
 * `DETAIL` odmów `decide_ksef_duplicate_original` (4.14): P0001 `STALE`
 * (`mode`, `offer`), `CHOICE` (`choice`), `ALREADY_IMPORTED` (`already`),
 * `IMPORT_MISMATCH` (`import-mismatch:number|seller`), kody blokady
 * (`known-now`, `cross-tenant`, `recheck-needed`, `provenance-review`);
 * 22023 projekcji (`import-projection:<kod 4.8>`).
 */
export type DuplicateDecisionRpcDetail =
  | 'mode'
  | 'offer'
  | 'choice'
  | 'already'
  | 'known-now'
  | 'cross-tenant'
  | 'recheck-needed'
  | 'provenance-review'
  | `import-mismatch:${OriginalImportProblem}`
  | `import-projection:${OriginalImportProblem}`;

/** Komunikaty-kody odmów `release_ksef_original_review` (P0001, 4.7); `release:not-review` niesie w `DETAIL` kod blokady, `no-marker` albo `none`. */
export const ORIGINAL_RELEASE_REFUSAL_CODES = [
  'release:not-review',
  'release:stale',
  'release:env',
  'release:own-file',
  'release:no-gate',
] as const;
export type OriginalReleaseRefusalCode = (typeof ORIGINAL_RELEASE_REFUSAL_CODES)[number];

/** `decide_ksef_duplicate_original` (12 nazwanych parametrów, bez wartości domyślnych). */
export interface DecideKsefDuplicateOriginalArgs extends DecideKsefDuplicateArgs {
  /** `import` — zapis K (oferty `pair`/`record`/`review-*`); `no-import` — tylko `released`. */
  mode: DuplicateDecisionMode;
  /** Oferta, którą widział klient albo operator (wiązanie, INV-8). */
  offer: DuplicateOriginalOffer;
  /** Projekcja K (`p_import`) — przy `import`; przy `no-import` `null`. */
  importPayload: KsefOriginalImportProjection | null;
}

/** Wynik (4.6 krok 19): 00148 + klucze trybów `import`/`no-import`. */
export interface DecideKsefDuplicateOriginalResult extends DecideKsefDuplicateResult {
  mode?: DuplicateDecisionMode;
  offer?: DuplicateOriginalOffer;
  /** K (tryb `import`); przy `already_decided` — ten sam co za pierwszym razem (INV-5). */
  imported_invoice_id?: string | null;
  retired_internal_number?: string | null;
  acquired_at_missing?: boolean;
  session_missing?: boolean;
}

export interface ReleaseKsefOriginalReviewArgs {
  invoiceId: string;
  tenantId: string;
  actorUserId: string;
  originalKsefNumber: string;
  originalSha256: string;
  env: string;
  /** Co operator sprawdził w pliku (10–1000 znaków). */
  note: string;
}

/** Wynik `release_ksef_original_review` (4.7 kroki 4 i 11). */
export interface ReleaseKsefOriginalReviewResult {
  invoice_id: string;
  original_ksef_number: string;
  /** Oddanie było już zapisane (zgubiona odpowiedź, podwójne kliknięcie) — bez zapisu i audytu. */
  already_released: boolean;
  /** `importGate.release.at` — klucz e-maila `…/oddanie-{Date.parse(release_at)}`. */
  release_at: string;
}

export interface FlagKsefOriginalRecheckArgs {
  invoiceId: string;
  tenantId: string;
  actorUserId: string;
  originalKsefNumber: string;
  originalSha256: string;
  kind: OriginalRecheckKind;
}

/** Wynik `flag_ksef_original_recheck` (4.7b) — bez odmów P0001. */
export interface FlagKsefOriginalRecheckResult {
  flagged: boolean;
  /** Znacznik już był (ponowienie) — bez zapisu i audytu. */
  already?: boolean;
  /** `not-pending` / `stale` — stan zmienił się od kliknięcia, nic do oznaczenia. */
  reason?: 'not-pending' | 'stale';
}

/* eslint-disable @typescript-eslint/no-unused-vars -- PR C kontrakt: sygnatury bez ciał, wyłącznik znika z ciałami */

/** `decide_ksef_duplicate_original` (00149, 4.6) — dla `faktflow-original`; powody PR B idą `callDecideKsefDuplicate`. */
export async function callDecideKsefDuplicateOriginal(
  admin: AdminClient,
  args: DecideKsefDuplicateOriginalArgs,
): Promise<{ data: DecideKsefDuplicateOriginalResult | null; error: DuplicateRpcError | null }> {
  throw new Error('PR C: nie zaimplementowane');
}

/** `release_ksef_original_review` (00149, 4.7) — operator oddaje decyzję klientowi (tylko `review-pair`). */
export async function callReleaseKsefOriginalReview(
  admin: AdminClient,
  args: ReleaseKsefOriginalReviewArgs,
): Promise<{ data: ReleaseKsefOriginalReviewResult | null; error: DuplicateRpcError | null }> {
  throw new Error('PR C: nie zaimplementowane');
}

/**
 * `flag_ksef_original_recheck` (00149, 4.7b) — trwały znacznik „sprawdź
 * ponownie” po odmowie w chwili zapisu. Nigdy nie rzuca: błąd →
 * `Sentry.captureException` (`tags.kind = 'ksef-duplicate-recheck-flag'`)
 * i `null` (wołający i tak zwraca tekst `FAKTFLOW.RECHECK`).
 */
export async function callFlagKsefOriginalRecheck(
  admin: AdminClient,
  args: FlagKsefOriginalRecheckArgs,
): Promise<FlagKsefOriginalRecheckResult | null> {
  throw new Error('PR C: nie zaimplementowane');
}

/**
 * `ksef_duplicate_decision_blocker_for_session` (00149, 4.9; GRANT
 * authenticated) — kod blokady własnej faktury dla sesji klienta (firma
 * z `x-active-org`); `null` = czeka na decyzję; błąd → `undefined`
 * (wołający odmawia `state-unknown`). Strona woła ją tylko przy znaczniku
 * `faktflow-original`.
 */
export async function readDuplicateDecisionBlockerForSession(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<string | null | undefined> {
  throw new Error('PR C: nie zaimplementowane');
}

/* eslint-enable @typescript-eslint/no-unused-vars */
