/**
 * Projekcja oryginału K do zapisu w FaktFlow (D-A4-1b-3 PR C, spec v3 5.3):
 * nagłówek i pozycje faktury z KSeF zbudowane tymi samymi budowniczymi co
 * Magiczny import (`lib/import/imported-invoice-row.ts`, PR C0), przekazywane
 * do `decide_ksef_duplicate_original` jako `p_import` (jsonb). Kolumny stałe
 * (origin, status, środowisko, K, ścieżka pliku, data nadania, waluta, rodzaj)
 * ustawia SQL — projekcja ich nie niesie (`ORIGINAL_IMPORT_SQL_COLUMNS`).
 *
 * `originalImportProjectionProblem` to lustro `ksef_original_import_mismatch`
 * (00149, 4.8): te same kody w tej samej kolejności, wspólna tabela przypadków
 * `ORIGINAL_IMPORT_MISMATCH_CASES` (test TS i R-C6 na bazie). Listy kluczy
 * i stawek niżej = listy w SQL 4.8 (pilnuje `tests/unit/zapis-oryginalu-migracja.test.ts`).
 *
 * CZYSTY moduł (importują go testy bazy i testy jednostkowe bez atrap
 * `server-only`): bez bazy, magazynu i zegara — czas podaje wywołujący (`now`).
 */

import type { ImportContent } from '@/lib/import/fa3-content';
import type { ImportLineAmounts } from '@/lib/import/fa3-line-amounts';
import type { ParsedInvoice } from '@/lib/import/fa3-parser';
import type { ImportedInvoiceInsert, ImportedLineInsert } from '@/lib/import/imported-invoice-row';
import { FA3_ONLY_VAT_RATES, VAT_RATES } from '@/lib/xml/fa3-p12';
import type { KsefEnvironment } from '@/types/ksef';

import type { DuplicateOriginalOffer, KsefDuplicateCheck } from './duplicate-check';

/**
 * Kolumny `buildImportedInvoiceRow`, które przy zapisie K ustawia SQL
 * (4.6 krok 11), a nie projekcja.
 */
export const ORIGINAL_IMPORT_SQL_COLUMNS = [
  'tenant_id',
  'direction',
  'origin',
  'ksef_status',
  'ksef_environment',
  'ksef_accepted_at',
  'ksef_number',
  'invoice_kind',
  'currency',
  'xml_storage_path',
] as const satisfies ReadonlyArray<keyof ImportedInvoiceInsert>;
type OriginalImportSqlColumn = (typeof ORIGINAL_IMPORT_SQL_COLUMNS)[number];

/** Klucze nagłówka projekcji: wszystkie kolumny C0 poza SQL-owymi — kompilacja pada, gdy C0 dostanie nową kolumnę. */
export type OriginalImportInvoiceKey = Exclude<keyof ImportedInvoiceInsert, OriginalImportSqlColumn>;
/** Klucze pozycji projekcji: dokładnie `ImportedLineInsert` z C0 (bez `invoice_id`). */
export type OriginalImportLineKey = keyof ImportedLineInsert;

// `Record` po typie kluczy C0 wymusza komplet (brakujący albo nadmiarowy klucz = błąd kompilacji);
// kolejność wpisów = kolejność listy w 4.8.
const INVOICE_KEY_SET: Readonly<Record<OriginalImportInvoiceKey, true>> = {
  internal_number: true,
  invoice_type: true,
  issue_date: true,
  sale_date: true,
  seller_nip: true,
  buyer_nip: true,
  net_total: true,
  vat_total: true,
  gross_total: true,
  payment_due_date: true,
  fa3_data: true,
  seller_data: true,
  buyer_data: true,
  payment_data: true,
  is_b2c: true,
  buyer_id_type: true,
  buyer_pesel: true,
  buyer_id_number: true,
  notes: true,
};

const LINE_KEY_SET: Readonly<Record<OriginalImportLineKey, true>> = {
  ordinal: true,
  name: true,
  unit: true,
  quantity: true,
  unit_price_net: true,
  net_amount: true,
  vat_rate: true,
  vat_amount: true,
  gross_amount: true,
};

/** Klucze `p_import->'invoice'` (4.8 `shape`) — podzbiór `ImportedInvoiceInsert` z C0. */
export const ORIGINAL_IMPORT_INVOICE_KEYS = Object.keys(INVOICE_KEY_SET) as readonly OriginalImportInvoiceKey[];
/** Klucze `p_import->'lines'[]` (4.8 `lines`) = klucze `ImportedLineInsert` z C0. */
export const ORIGINAL_IMPORT_LINE_KEYS = Object.keys(LINE_KEY_SET) as readonly OriginalImportLineKey[];

/** Stawki przyjmowane przez 4.8: FaktFlow zawsze, FA(3) spoza FaktFlow tylko przy ofercie `review-*` (F42); `nieznana` nigdy. */
export const ORIGINAL_IMPORT_VAT_RATES = { faktflow: VAT_RATES, reviewOnly: FA3_ONLY_VAT_RATES } as const;

/** `buyer_id_type` przyjmowane przez 4.8 `shape` (enum bazy). */
export const ORIGINAL_IMPORT_BUYER_ID_TYPES = ['nip', 'pesel', 'id_card', 'passport', 'no_id'] as const;

/** Granice z tabeli 4.8 (`shape`, `lines`) — wspólne dla lustra TS i SQL. */
export const ORIGINAL_IMPORT_LIMITS = {
  /** Liczba pozycji ∈ [1, 1000]. */
  maxLines: 1000,
  /** `internal_number` — napis 1–100 znaków. */
  internalNumberMax: 100,
  /** `buyer_id_number` — napis ≤ 100. */
  buyerIdNumberMax: 100,
  /** `notes` — napis ≤ 5000. */
  notesMax: 5000,
  /** `name` pozycji — napis 1–512. */
  lineNameMax: 512,
  /** `unit` pozycji — napis 1–50. */
  lineUnitMax: 50,
  /** `ordinal` — liczba całkowita 1–100000, bez powtórzeń. */
  ordinalMax: 100000,
  /** |kwota|, |ilość| < 1e10. */
  amountAbsBelow: 1e10,
  /** Miejsca po przecinku: kwoty (netto, VAT, brutto, sumy) 2; ilość i cena 4. */
  amountScale: 2,
  quantityScale: 4,
} as const;

/** Kody `ksef_original_import_mismatch` w kolejności sprawdzeń 4.8 (pierwszy niezgodny wygrywa). */
export const ORIGINAL_IMPORT_PROBLEMS = [
  'shape',
  'lines',
  'number',
  'seller',
  'kind',
  'issue-date',
  'gross',
  'buyer',
  'currency',
  'xml',
  'totals',
  'fa3',
] as const;
export type OriginalImportProblem = (typeof ORIGINAL_IMPORT_PROBLEMS)[number];

/**
 * Klasa „klient” (4.8): RPC odmawia P0001 `IMPORT_MISMATCH`
 * (`DETAIL = 'import-mismatch:<kod>'`); pozostałe kody — 22023
 * (`DETAIL = 'import-projection:<kod>'`, błąd programu).
 */
export const ORIGINAL_IMPORT_CLIENT_PROBLEMS = ['number', 'seller'] as const satisfies readonly OriginalImportProblem[];

/** `p_import` dla `decide_ksef_duplicate_original` w trybie `import` (5.3). */
export interface KsefOriginalImportProjection {
  v: 1;
  invoice: Pick<ImportedInvoiceInsert, OriginalImportInvoiceKey>;
  lines: Array<Pick<ImportedLineInsert, OriginalImportLineKey>>;
  xml: { storage_path: string; sha256: string; size_bytes: number };
}

export interface OriginalImportProjectionContext {
  tenantId: string;
  env: KsefEnvironment;
  /** `original_check` znacznika (`archivePath`, `sha256`, `sizeBytes`, `acquiredAt`, `checkedAt`). */
  check: KsefDuplicateCheck;
  /** K. */
  ksefNumber: string;
  /** Czas przygotowania (`fa3_data.import.preparedAt`). */
  now: Date;
}

export interface OriginalImportProblemContext {
  /** Numer X (`p_inv.internal_number`); `null` → `number`. */
  internalNumber: string | null;
  /** `tenants.nip` firmy. */
  tenantNip: string;
  tenantId: string;
  /** K. */
  ksefNumber: string;
  /** `original_check` znacznika (`summary`, `archivePath`, `sha256`, `sizeBytes`). */
  check: KsefDuplicateCheck;
  /** Oferta: `pair`/`record` — 8 stawek FaktFlow; `review-*` — także `FA3_ONLY_VAT_RATES`. */
  offer: DuplicateOriginalOffer;
}

/* eslint-disable @typescript-eslint/no-unused-vars -- PR C kontrakt (commit 1): sygnatury bez ciał, wyłącznik znika z ciałami */

/**
 * Projekcja K (5.3): `buildImportedInvoiceRow(parsed, { tenantId, direction:
 * 'outgoing', origin: 'ksef_import', ksefStatus: 'accepted', ksefEnvironment:
 * env, ksefAcceptedAt: check.acquiredAt, ksefNumber: K, xmlStoragePath:
 * check.archivePath, notes: parsed.footerNote ?? null, provenance: { source:
 * ORIGINAL_IMPORT_SOURCE, originalSha256, checkedAt, preparedAt, gateRules } },
 * content, amounts)` zawężone do `ORIGINAL_IMPORT_INVOICE_KEYS`;
 * `lines = buildImportedLineRows(parsed, amounts)`; `xml` z `check`.
 * Bez upsertu kontrahentów i produktów.
 */
export function buildOriginalImportProjection(
  parsed: ParsedInvoice,
  content: ImportContent,
  amounts: ImportLineAmounts,
  ctx: OriginalImportProjectionContext,
): KsefOriginalImportProjection {
  throw new Error('PR C: nie zaimplementowane');
}

/**
 * Lustro `ksef_original_import_mismatch` (4.8): `null` albo PIERWSZY kod
 * niezgodności (`ORIGINAL_IMPORT_PROBLEMS`). Wejście jak jsonb w SQL —
 * dowolny kształt (przypadki `shape` w `ORIGINAL_IMPORT_MISMATCH_CASES`);
 * nigdy nie rzuca.
 */
export function originalImportProjectionProblem(
  projection: unknown,
  ctx: OriginalImportProblemContext,
): OriginalImportProblem | null {
  throw new Error('PR C: nie zaimplementowane');
}

/* eslint-enable @typescript-eslint/no-unused-vars */
