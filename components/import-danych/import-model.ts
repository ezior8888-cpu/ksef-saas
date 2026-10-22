import type { FileImportSource } from '@/app/onboarding/magic-import/actions';
import { countLabel } from '@/lib/i18n/plural';
import type { Database } from '@/types/database';

/**
 * Model widoku Centrum importu (poprawka Bartosza 22.10.2026: import danych
 * w stylu Finory). Same czyste funkcje nad wierszami `import_jobs` — bez
 * zapytań i bez logiki importu (ta zostaje w `lib/import/**` i runnerach).
 *
 * Liczby na kaflach biorą się WYŁĄCZNIE z liczników, które joby same zapisują
 * w `import_jobs` (`invoices_imported`, `contractors_created`,
 * `products_created`). Silnik liczy tylko nowo zapisane faktury (duplikaty
 * pomija), więc suma po jobach to liczba faktur, które import naprawdę dodał.
 */

type ImportJobRow = Database['public']['Tables']['import_jobs']['Row'];

/** Kolumny, które czyta strona — bez ścieżki pliku w magazynie i bez `triggered_by`. */
export const IMPORT_HISTORY_COLUMNS =
  'id, source, direction, date_from, date_to, status, progress_percent, progress_message, invoices_imported, contractors_created, contractors_updated, products_created, warnings, source_filename, created_at, completed_at' as const;

export type ImportHistoryJob = Pick<
  ImportJobRow,
  | 'id'
  | 'source'
  | 'direction'
  | 'date_from'
  | 'date_to'
  | 'status'
  | 'progress_percent'
  | 'progress_message'
  | 'invoices_imported'
  | 'contractors_created'
  | 'contractors_updated'
  | 'products_created'
  | 'warnings'
  | 'source_filename'
  | 'created_at'
  | 'completed_at'
>;

/** Ile ostatnich importów czytamy; przy pełnej liście kafle mówią „z ostatnich 100”. */
export const IMPORT_HISTORY_LIMIT = 100;

/** Odświeżanie historii, gdy coś się importuje: co 4 s, najwyżej 45 razy (3 minuty). */
export const POLL_INTERVAL_MS = 4000;
export const MAX_POLL_TICKS = 45;

/** Adres Magicznego importu — ten sam format co w ustawieniach KSeF i onboardingu. */
export function magicImportHref(tenantId: string): string {
  return `/onboarding/magic-import?tenantId=${encodeURIComponent(tenantId)}`;
}

/** Szczegóły i postęp joba — istniejąca strona z odświeżaniem na żywo. */
export function importProgressHref(jobId: string): string {
  return `/onboarding/progress/${encodeURIComponent(jobId)}`;
}

/** Źródła importu z pliku — te same i w tej samej kolejności co w onboardingu. */
export const FILE_SOURCES: readonly {
  id: FileImportSource;
  label: string;
  description: string;
  format: 'CSV' | 'XML';
}[] = [
  { id: 'fakturownia_csv', label: 'Fakturownia', description: 'Plik CSV z eksportu faktur', format: 'CSV' },
  { id: 'infakt_csv', label: 'inFakt', description: 'Plik CSV z eksportu faktur', format: 'CSV' },
  { id: 'wfirma_csv', label: 'wFirma', description: 'Plik CSV z eksportu faktur', format: 'CSV' },
  { id: 'ifirma_csv', label: 'iFirma', description: 'Plik CSV z eksportu faktur', format: 'CSV' },
  { id: 'jpk_fa', label: 'Inny program', description: 'Plik JPK_FA z dowolnego programu', format: 'XML' },
];

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  ksef_history: 'Magiczny import z KSeF',
  fakturownia_csv: 'Fakturownia',
  infakt_csv: 'inFakt',
  wfirma_csv: 'wFirma',
  ifirma_csv: 'iFirma',
  jpk_fa: 'Plik JPK_FA',
};

/** Nazwa źródła w historii; nieznane albo puste źródło nie wywraca listy. */
export function sourceLabel(source: string | null): string {
  return (source && SOURCE_LABELS[source]) || 'Import';
}

export function isKsefSource(source: string | null): boolean {
  return source === 'ksef_history';
}

export type ImportStatusGroup = 'running' | 'completed' | 'failed' | 'cancelled';

/** Kroki joba w toku — te same nazwy co na stronie postępu (`import-progress-view`). */
const RUNNING_STEPS: Readonly<Record<string, string>> = {
  pending: 'Inicjalizacja',
  queued: 'Kolejkowanie',
  parsing: 'Wczytywanie danych',
  extracting: 'Pobieranie faktur',
  deduplicating: 'Analiza danych',
  inserting: 'Zapisywanie',
};

export function statusGroup(status: string): ImportStatusGroup {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  if (status in RUNNING_STEPS) return 'running';
  // `failed` i każdy status spoza listy — nie udajemy, że coś trwa albo się udało.
  return 'failed';
}

export const isRunning = (job: Pick<ImportHistoryJob, 'status'>) => statusGroup(job.status) === 'running';

export function runningStep(status: string): string {
  return RUNNING_STEPS[status] ?? 'W toku';
}

export function progressPercent(job: Pick<ImportHistoryJob, 'progress_percent'>): number {
  const value = Number(job.progress_percent);
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** „2026-04-01” → „01.04.2026”; niepoprawna wartość wraca bez zmian. */
export function formatIsoDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : iso;
}

const WARSAW_DAY = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'Europe/Warsaw',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Znacznik czasu z bazy jako „DD.MM.RRRR” w czasie polskim. */
export function formatWarsawDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : WARSAW_DAY.format(date);
}

/** Podpis pod nazwą źródła: nazwa pliku albo zakres dat KSeF (z kierunkiem, gdy to zakupy). */
export function sourceDetail(job: Pick<ImportHistoryJob, 'source' | 'source_filename' | 'date_from' | 'date_to' | 'direction'>): string | null {
  if (job.source_filename) return job.source_filename;
  if (job.date_from && job.date_to) {
    const range = `${formatIsoDay(job.date_from)} – ${formatIsoDay(job.date_to)}`;
    return job.direction === 'received' ? `${range} · otrzymane` : range;
  }
  return null;
}

const n = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export function warningCount(job: Pick<ImportHistoryJob, 'warnings'>): number {
  return Array.isArray(job.warnings) ? job.warnings.filter((w) => typeof w === 'string').length : 0;
}

/** Wynik zakończonego importu: „124 faktury · 18 kontrahentów · 40 produktów”. */
export function completedSummary(
  job: Pick<ImportHistoryJob, 'invoices_imported' | 'contractors_created' | 'contractors_updated' | 'products_created'>,
): string {
  const invoices = n(job.invoices_imported);
  // Jak kafel „Kontrahenci” na stronie postępu: nowi i uzupełnieni.
  const contractors = n(job.contractors_created) + n(job.contractors_updated);
  const products = n(job.products_created);
  if (invoices + contractors + products === 0) return 'Brak nowych faktur';
  const parts = [countLabel(invoices, ['faktura', 'faktury', 'faktur'])];
  if (contractors > 0) parts.push(countLabel(contractors, ['kontrahent', 'kontrahenci', 'kontrahentów']));
  if (products > 0) parts.push(countLabel(products, ['produkt', 'produkty', 'produktów']));
  return parts.join(' · ');
}

/** Powód błędu z joba (np. „Zawęź zakres dat i ponów import”) i co mimo to zapisano. */
export function failureNote(job: Pick<ImportHistoryJob, 'progress_message' | 'invoices_imported'>): {
  reason: string;
  saved: string | null;
} {
  const saved = n(job.invoices_imported);
  return {
    reason: job.progress_message?.trim() || 'Import się nie udał.',
    saved: saved > 0 ? `Zapisano ${countLabel(saved, ['fakturę', 'faktury', 'faktur'])}` : null,
  };
}

export interface ImportSummary {
  invoices: number;
  contractors: number;
  products: number;
  /** Najnowszy zakończony import (lista idzie od najnowszych). */
  lastCompleted: ImportHistoryJob | null;
  /** Lista ucięta limitem — sumy są z ostatnich `limit` importów. */
  partial: boolean;
}

/**
 * Sumy do kafli. Faktury liczymy też z nieudanych jobów: przy „Część faktur
 * KSeF nie została zapisana” runner zapisuje w `invoices_imported` te, które
 * już są w bazie. Kontrahenci i produkty — tylko nowo utworzeni (uzupełnieni
 * w kolejnych importach to ci sami kontrahenci, suma by ich dublowała).
 */
export function summarizeImports(jobs: readonly ImportHistoryJob[], limit = IMPORT_HISTORY_LIMIT): ImportSummary {
  return {
    invoices: jobs.reduce((sum, job) => sum + n(job.invoices_imported), 0),
    contractors: jobs.reduce((sum, job) => sum + n(job.contractors_created), 0),
    products: jobs.reduce((sum, job) => sum + n(job.products_created), 0),
    lastCompleted: jobs.find((job) => statusGroup(job.status) === 'completed') ?? null,
    partial: jobs.length >= limit,
  };
}
