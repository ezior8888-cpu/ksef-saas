/**
 * Zapis przebiegów jobów do `inngest_run_log`.
 *
 * Tabelę czytają panel `/admin/system` (`getInngestJobStats`), metryki
 * biznesowe i raport dzienny („błędy jobów”), ale do 01.10.2026 nic do niej
 * nie pisało — wskaźniki pokazywały zawsze zero, także gdy joby padały.
 *
 * Zapis jest najlepszym wysiłkiem: błąd bazy nie może zatrzymać joba ani
 * zmienić jego wyniku. Bez `tenant_id`/`invoice_id` (klucze obce — zły
 * identyfikator z payloadu wywróciłby zapis) i bez payloadu (dane klientów).
 */

import { scrubTelemetryText } from '@/lib/observability/scrub';
import { createAdminClient } from '@/lib/supabase/admin';

export interface JobRunRecord {
  queue: string;
  runId: string;
  status: 'succeeded' | 'failed';
  durationMs: number;
  error?: Error;
}

const MAX_ERROR_LENGTH = 500;

type RunLogClient = Pick<ReturnType<typeof createAdminClient>, 'from'>;

export async function recordJobRun(
  record: JobRunRecord,
  client: RunLogClient = createAdminClient(),
): Promise<void> {
  try {
    const { error } = await client.from('inngest_run_log').insert({
      event_name: record.queue,
      run_id: record.runId,
      status: record.status,
      duration_ms: Math.max(0, Math.round(record.durationMs)),
      error_message: record.error
        ? scrubTelemetryText(record.error.message).slice(0, MAX_ERROR_LENGTH)
        : null,
    });
    if (error) console.error('[jobs/run-log] zapis przebiegu nieudany', error.message);
  } catch (e) {
    console.error('[jobs/run-log] zapis przebiegu nieudany', e instanceof Error ? e.message : String(e));
  }
}
