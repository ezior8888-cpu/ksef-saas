/**
 * Inngest: Magiczny Import historii faktur z KSeF (wydane lub odebrane).
 */

import {
  type ParsedInvoice,
  parseFa3Xml,
} from '@/lib/import/fa3-parser';
import {
  fetchInvoicesMetadata,
  fetchInvoiceXml,
} from '@/lib/ksef/history-fetcher';
import { processImportedInvoices } from '@/lib/import/import-engine';
import { createAdminClient } from '@/lib/supabase/server';

import { importKsefHistoryRequested, inngest } from '../client';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';

/**
 * Obsługa po wyczerpaniu prób (Etap 7): wspólna dla Inngest `onFailure`
 * i pg-boss `onExhausted` — oznacza job importu historii KSeF jako nieudany,
 * żeby pasek postępu w UI nie wisiał w nieskończoność.
 */
export async function onMagicImportExhausted(
  failureErr: Error,
  data: { importJobId: string },
): Promise<void> {
  const { importJobId } = data;
  const supabase = createAdminClient();
  const failureMsg = `${failureErr.name}: ${failureErr.message}`.slice(0, 900);
  const { error } = await supabase
    .from('import_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      progress_percent: 100,
      progress_message: failureMsg,
    })
    .eq('id', importJobId);
  if (error) throw new Error(error.message);
}

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-c.ts
 */
export async function runMagicImportKsef(data: Parameters<typeof importKsefHistoryRequested.create>[0], { step }: JobContext) {
    const { importJobId, tenantId, dateFrom, dateTo, direction } = data;

    const supabase = createAdminClient();
    const invoiceDirection = direction === 'received' ? 'incoming' : 'outgoing';

    await step.run('mark-parsing', async () => {
      const { error } = await supabase
        .from('import_jobs')
        .update({
          status: 'parsing',
          started_at: new Date().toISOString(),
          progress_message: 'Łączymy się z KSeF...',
          progress_percent: 5,
        })
        .eq('id', importJobId);
      if (error) throw new Error(error.message);
    });

    const metadata = await step.run('fetch-metadata', async () => {
      return fetchInvoicesMetadata({ tenantId, dateFrom, dateTo, direction });
    });

    await step.run('update-found-count', async () => {
      const progressMessage = metadata.truncated
        ? `Znaleziono ${metadata.totalCount} faktur (limit importu — lista ucięta)`
        : `Znaleziono ${metadata.totalCount} faktur`;

      const { error } = await supabase
        .from('import_jobs')
        .update({
          invoices_found: metadata.totalCount,
          progress_message: progressMessage,
          progress_percent: 10,
          status: 'extracting',
        })
        .eq('id', importJobId);
      if (error) throw new Error(error.message);
    });

    if (metadata.totalCount === 0) {
      await step.run('mark-empty-completed', async () => {
        const { error } = await supabase
          .from('import_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            progress_percent: 100,
            progress_message: 'Brak faktur w wybranym okresie',
          })
          .eq('id', importJobId);
        if (error) throw new Error(error.message);
      });
      return { success: true as const, imported: 0 };
    }

    const parsedInvoices: ParsedInvoice[] = [];
    const batchSize = 10;
    const total = metadata.invoices.length;

    for (let i = 0; i < total; i += batchSize) {
      const batch = metadata.invoices.slice(i, i + batchSize);

      const batchResults = await step.run(`fetch-batch-${i}`, async () => {
        const results: ParsedInvoice[] = [];
        for (const meta of batch) {
          try {
            const xml = await fetchInvoiceXml(tenantId, meta.ksefNumber);
            results.push(parseFa3Xml(xml, { ksefNumber: meta.ksefNumber }));
          } catch (e) {
            console.error(`Failed to fetch ${meta.ksefNumber}:`, e);
          }
        }
        return results;
      });

      parsedInvoices.push(...batchResults);

      const processedCount = Math.min(i + batch.length, total);
      await step.run(`update-progress-${i}`, async () => {
        const percent = 10 + Math.floor((processedCount / total) * 70);
        const { error } = await supabase
          .from('import_jobs')
          .update({
            progress_percent: percent,
            progress_message: `Pobrano ${processedCount} z ${metadata.totalCount} faktur`,
          })
          .eq('id', importJobId);
        if (error) throw new Error(error.message);
      });

      if (i + batchSize < total) {
        await step.sleep(`rate-limit-delay-${i}`, '500ms');
      }
    }

    await step.run('mark-deduplicating', async () => {
      const { error } = await supabase
        .from('import_jobs')
        .update({
          status: 'deduplicating',
          progress_percent: 85,
          progress_message: 'Analizujemy kontrahentów i produkty...',
        })
        .eq('id', importJobId);
      if (error) throw new Error(error.message);
    });

    const processResult = await step.run('process-invoices', async () => {
      return processImportedInvoices({
        tenantId,
        importJobId,
        invoices: parsedInvoices,
        source: 'ksef_history',
        invoiceDirection,
        invoiceKsefStatus: 'accepted',
      });
    });

    await step.run('mark-completed', async () => {
      const { error } = await supabase
        .from('import_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress_percent: 100,
          progress_message: 'Import zakończony',
          invoices_imported: processResult.invoicesImported,
          contractors_created: processResult.contractorsCreated,
          contractors_updated: processResult.contractorsUpdated,
          products_created: processResult.productsCreated,
          warnings: processResult.warnings,
        })
        .eq('id', importJobId);
      if (error) throw new Error(error.message);
    });

    return {
      success: true as const,
      imported: processResult.invoicesImported,
      contractors: processResult.contractorsCreated,
      products: processResult.productsCreated,
    };
}

export const magicImportKsefJob = inngest.createFunction(
  {
    id: 'magic-import-ksef',
    name: 'Magiczny Import historii z KSeF',
    retries: 2,
    // Per-NIP concurrency: max 3 równoczesne importy historii per tenant.
    // Magiczny Import wystawia setki żądań do KSeF (`fetch-batch-${i}` po
    // 10 faktur), więc bez tego limita jeden tenant z dużą historią potrafi
    // zająć cały budżet rate-limitera u MF.
    concurrency: { key: 'event.data.nip', limit: 3 },
    triggers: [importKsefHistoryRequested],
    onFailure: async ({ error: failureErr, event }) =>
      onMagicImportExhausted(
        failureErr,
        (event.data.event as { data: { importJobId: string } }).data,
      ),
  },
  async ({ event, step, logger, attempt }) =>
    runMagicImportKsef(event.data as Parameters<typeof importKsefHistoryRequested.create>[0], toJobContext({ step, logger, attempt })),
);
