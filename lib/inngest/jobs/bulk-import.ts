/**
 * Inngest: import z wgranego pliku (JPK_FA, CSV).
 */

import { NonRetriableError } from 'inngest';

import type { ParsedInvoice } from '@/lib/import/fa3-parser';
import { parseCsv, type CsvSource } from '@/lib/import/csv-parsers';
import { downloadImportFile } from '@/lib/import/file-storage';
import { parseJpkFaXml } from '@/lib/import/jpk-fa-parser';
import { processImportedInvoices } from '@/lib/import/import-engine';
import { createAdminClient } from '@/lib/supabase/server';

import { importFileUploaded, inngest } from '../client';

export const bulkImportFileJob = inngest.createFunction(
  {
    id: 'bulk-import-file',
    name: 'Import z pliku JPK/CSV',
    retries: 1,
    concurrency: { limit: 5 },
    triggers: [importFileUploaded],
    onFailure: async ({ error: failureErr, event, step }) => {
      const original = event.data.event as {
        data: { importJobId: string };
      };
      const { importJobId } = original.data;

      await step.run('mark-import-failed', async () => {
        const supabase = createAdminClient();
        const failureMsg =
          `${failureErr.name}: ${failureErr.message}`.slice(0, 900);
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
      });
    },
  },
  async ({ event, step }) => {
    const { importJobId, tenantId, filePath, source } = event.data;

    const supabase = createAdminClient();

    await step.run('mark-parsing', async () => {
      const { error } = await supabase
        .from('import_jobs')
        .update({
          status: 'parsing',
          started_at: new Date().toISOString(),
          progress_message: 'Wczytujemy plik...',
          progress_percent: 10,
        })
        .eq('id', importJobId);
      if (error) throw new Error(error.message);
    });

    const fileContent = await step.run('download-file', async () => {
      const buffer = await downloadImportFile(filePath);
      return buffer.toString('utf-8');
    });

    const parseResult = await step.run('parse-file', async (): Promise<{
      invoices: ParsedInvoice[];
      warnings: string[];
    }> => {
      try {
        let invoices: ParsedInvoice[] = [];
        let warnings: string[] = [];

        if (source === 'jpk_fa') {
          const result = parseJpkFaXml(fileContent);
          invoices = result.invoices;
          warnings = result.warnings;
        } else {
          const csvSource = source.replace('_csv', '') as CsvSource;
          const result = parseCsv(fileContent, csvSource);
          invoices = result.invoices;
          warnings = result.warnings;
        }

        return { invoices, warnings };
      } catch (e) {
        throw new NonRetriableError(
          `Parse error: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });

    await step.run('update-found-count', async () => {
      const { error } = await supabase
        .from('import_jobs')
        .update({
          invoices_found: parseResult.invoices.length,
          progress_message: `Znaleziono ${parseResult.invoices.length} faktur`,
          progress_percent: 50,
          status: 'extracting',
          warnings: parseResult.warnings,
        })
        .eq('id', importJobId);
      if (error) throw new Error(error.message);
    });

    const processResult = await step.run('process-invoices', async () => {
      const { error: statusErr } = await supabase
        .from('import_jobs')
        .update({
          status: 'deduplicating',
          progress_percent: 75,
          progress_message: 'Analizujemy kontrahentów i produkty...',
        })
        .eq('id', importJobId);
      if (statusErr) throw new Error(statusErr.message);

      return processImportedInvoices({
        tenantId,
        importJobId,
        invoices: parseResult.invoices,
        source,
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
          warnings: [...parseResult.warnings, ...processResult.warnings],
        })
        .eq('id', importJobId);
      if (error) throw new Error(error.message);
    });

    return {
      success: true as const,
      imported: processResult.invoicesImported,
    };
  },
);
