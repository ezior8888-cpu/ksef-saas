/**
 * Zapis oryginału z KSeF — część serwerowa (D-A4-1b-3 PR C, spec v3 5.3):
 * suchy przebieg przed RPC decyzji (`prepareOriginalImport`: archiwum, brama,
 * projekcja — tylko odczyty) i alarmy po decyzji ze stanu bazy
 * (`originalDecisionAlarms`, T5: na każdej ścieżce akcji, odcisk Sentry
 * `[kind, invoiceId]`).
 *
 * Woła go akcja klienta (`components/invoices/actions-detail.ts`) i akcje
 * operatora (`app/admin/ksef/actions.ts`); strona operatora robi suchy
 * przebieg, żeby pokazać `recordable` (INV-13 — bez alarmów i zapisów).
 * Strona klienta go NIE woła.
 */

import 'server-only';

import type { createAdminClient } from '@/lib/supabase/admin';
import type { KsefEnvironment } from '@/types/ksef';

import type {
  DuplicateOriginalOffer,
  KsefDuplicateCheck,
  KsefOriginalImportGate,
  OriginalRecheckKind,
} from './duplicate-check';
import type { KsefOriginalImportProjection } from './duplicate-original-projection';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Dlaczego oryginału nie zapiszemy teraz (5.3 kroki 1–6). */
export type PrepareOriginalImportFailureKind =
  /** `NoSuchKey`/404 w magazynie. */
  | 'archive-missing'
  /** SHA-256 albo długość bajtów ≠ `check.sha256` / `check.sizeBytes`. */
  | 'archive-mismatch'
  /** Inny błąd magazynu — chwilowy; bez znacznika `recheckNeeded` (`cause` do Sentry). */
  | 'read-failed'
  /** Tylko `pair`/`record`: bieżąca brama ma inny `kind` albo inne `problems` (zbiór) niż zapisana; sama inna `rules` to nie zmiana. */
  | 'gate-drift'
  /** Projekcji nie da się zbudować albo nie przechodzi lustra 4.8 (`detail` = problem bramy albo kod 4.8). */
  | 'not-buildable';

export interface PrepareOriginalImportInput {
  tenantId: string;
  /** Numer X. */
  internalNumber: string;
  /** `tenants.nip`. */
  tenantNip: string;
  /** Oferta pokazana klientowi/operatorowi (z widoku). */
  offer: DuplicateOriginalOffer;
  check: KsefDuplicateCheck;
  /** K. */
  ksefNumber: string;
  env: KsefEnvironment;
  now: Date;
}

export type PrepareOriginalImportResult =
  | { ok: true; projection: KsefOriginalImportProjection; gate: KsefOriginalImportGate }
  | { ok: false; kind: PrepareOriginalImportFailureKind; detail?: string; cause?: unknown };

export interface OriginalDecisionAlarmsInput {
  tenantId: string;
  /** X. */
  invoiceId: string;
  /** K z wyniku RPC albo z `decision.importedInvoiceId`; `null` — decyzja bez zapisu (`no-import`), nic do sprawdzenia. */
  importedInvoiceId: string | null;
}

/* eslint-disable @typescript-eslint/no-unused-vars -- PR C kontrakt (commit 1): sygnatury bez ciał, wyłącznik znika z ciałami */

/**
 * Suchy przebieg zapisu oryginału (5.3): `downloadFromR2(check.archivePath)` →
 * SHA-256 i rozmiar → `evaluateOriginalGate` → zmiana bramy (tylko
 * `pair`/`record`) → zapisywalność (`ORIGINAL_GATE_UNBUILDABLE_PROBLEMS` przy
 * `review-*`) → `buildOriginalImportProjection` + `originalImportProjectionProblem`.
 * Tylko odczyty; nigdy nie pisze i nie alarmuje.
 */
export async function prepareOriginalImport(input: PrepareOriginalImportInput): Promise<PrepareOriginalImportResult> {
  throw new Error('PR C: nie zaimplementowane');
}

/**
 * Rodzaj znacznika `recheckNeeded` dla odmowy suchego przebiegu na ścieżce
 * zapisu (5.6 krok 9, wspólne dla klienta i operatora): `archive-*` i
 * `gate-drift` — ten sam rodzaj; `not-buildable` z `detail` `number`/`seller`
 * → `import-mismatch`, inaczej `not-buildable`; `read-failed` → `null`
 * (chwilowy błąd magazynu — bez znacznika).
 */
export function originalRecheckKindFor(
  failure: { kind: PrepareOriginalImportFailureKind; detail?: string },
): OriginalRecheckKind | null {
  throw new Error('PR C: nie zaimplementowane');
}

/**
 * Alarmy po decyzji — ze stanu bazy, na KAŻDEJ ścieżce sukcesu akcji (nowa
 * decyzja, `already_decided`, wczesny widok `decided`): K bez
 * `ksef_accepted_at` → `ksef-duplicate-import-no-date`; K bez wpisu z sesją
 * (`response_ksef_number = K`, sesja nie NULL) → `ksef-duplicate-import-no-session`
 * (`level: 'warning'`, `tags.area = 'ksef.duplicate-decision'`, odcisk
 * `[kind, invoiceId]`). Błąd odczytu → `Sentry.captureException`. Nigdy nie rzuca.
 */
export async function originalDecisionAlarms(admin: AdminClient, input: OriginalDecisionAlarmsInput): Promise<void> {
  throw new Error('PR C: nie zaimplementowane');
}

/* eslint-enable @typescript-eslint/no-unused-vars */
