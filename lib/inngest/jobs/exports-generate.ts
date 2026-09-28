// lib/inngest/jobs/exports-generate.ts
// Inngest: generuje plik exportu i zapisuje w R2.
//
// Flow rozbity na dwa memoizowane przez Inngest stepy:
//
//   1. generate-upload — generuje plik raz, wysyła dokładnie te bajty i liczy
//      SHA-256 zapisanych bajtów. Zwraca tylko metadane. Buffer NIE jest
//      serializowany do Inngest store'u (default limit ~64 KB na step memo,
//      a XML/Excel/CSV potrafią mieć MB-y; do tego niepotrzebnie wystawiamy
//      treść biznesową w cudzej bazie).
//
//      Warunkowy PUT chroni pierwszy obiekt przed równoległym nadpisaniem.
//      Gdy istnieje po wcześniejszej próbie, hash liczymy z jego treści.
//
//   2. persist — UPSERT export_files z ON CONFLICT (export_job_id, filename)
//      + UPDATE export_jobs.status = 'completed'. Wymaga unique indexu
//      `uq_export_files_job_filename` z migracji 00026.

import { createHash } from 'node:crypto';

import { NonRetriableError } from 'inngest';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';

import {
  exportsGenerateRequested,
  inngest,
} from '@/lib/inngest/client';
import { generateComarchOptimaXml } from '@/lib/exports/comarch-optima-generator';
import {
  generateInsertSubiektCsv,
  generateSymfoniaCsv,
  generateUniversalCsv,
  generateWaproCsv,
} from '@/lib/exports/csv-generators';
import { fetchInvoicesForExport } from '@/lib/exports/data-fetcher';
import { generateJpkFa } from '@/lib/exports/jpk-fa-generator';
import { MissingTaxOfficeError, readTenantTaxOffice } from '@/lib/exports/tax-office';
import { readTaxpayerEmail } from '@/lib/exports/taxpayer-email';
import { generateJpkV7m, MissingTaxpayerEmailError } from '@/lib/exports/jpk-v7m-generator';
import { generateKpirXlsx } from '@/lib/exports/kpir-generator';
import { createAdminClient } from '@/lib/supabase/admin';
import { downloadFromR2, uploadToR2IfAbsent } from '@/lib/storage/r2';

import type { Database } from '@/types/database';
import type { FetchedInvoiceData } from '@/lib/exports/data-fetcher';

type ExportJobRow = Database['public']['Tables']['export_jobs']['Row'];

interface GeneratedExportFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

interface GeneratedExportMeta {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
}

function resolveExportDirection(job: ExportJobRow): 'issued' | 'received' | 'both' {
  if (job.include_issued && job.include_received) return 'both';
  if (job.include_issued) return 'issued';
  if (job.include_received) return 'received';
  return 'issued';
}

function safeNip(nip: string): string {
  return nip.replace(/\D/g, '').slice(0, 14) || 'braknip';
}

/** Builds the bytes for one export attempt. Some formats include current time. */
async function generateExportFile(
  job: ExportJobRow,
  data: FetchedInvoiceData,
): Promise<GeneratedExportFile> {
  const periodStr = `${job.period_start}_${job.period_end}`;
  const nip = safeNip(data.issuer.nip);

  // `jpk_v7m` doszło migracją 00056; `types/database.ts` regenerujemy
  // dopiero przed Fazą 35 — cast rozszerza union o nową wartość enuma.
  const format = job.format as ExportJobRow['format'] | 'jpk_v7m';

  switch (format) {
    case 'jpk_v7m': {
      // Zakupy z listy wydatków, nie z faktur otrzymanych (zob. data-fetcher).
      const xml = generateJpkV7m({
        issuer: data.issuer,
        periodStart: job.period_start,
        periodEnd: job.period_end,
        issuedInvoices: data.issuedInvoices,
        expenses: data.expenses,
      });
      return {
        buffer: Buffer.from(xml, 'utf8'),
        filename: `JPK_V7M_${nip}_${periodStr}.xml`,
        mimeType: 'application/xml',
      };
    }
    case 'jpk_fa': {
      const xml = generateJpkFa({
        issuer: data.issuer,
        periodStart: job.period_start,
        periodEnd: job.period_end,
        issuedInvoices: data.issuedInvoices,
        receivedInvoices: data.receivedInvoices,
      });
      return {
        buffer: Buffer.from(xml, 'utf8'),
        filename: `JPK_FA_${nip}_${periodStr}.xml`,
        mimeType: 'application/xml',
      };
    }
    case 'kpir_excel': {
      const buffer = await generateKpirXlsx({
        issuer: data.issuer,
        periodStart: job.period_start,
        periodEnd: job.period_end,
        issuedInvoices: data.issuedInvoices,
        expenses: data.expenses,
      });
      return {
        buffer,
        filename: `KPiR_${nip}_${periodStr}.xlsx`,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    case 'comarch_optima': {
      const xml = generateComarchOptimaXml({
        issuer: data.issuer,
        periodStart: job.period_start,
        periodEnd: job.period_end,
        issuedInvoices: data.issuedInvoices,
        receivedInvoices: data.receivedInvoices,
      });
      return {
        buffer: Buffer.from(xml, 'utf8'),
        filename: `Optima_${nip}_${periodStr}.xml`,
        mimeType: 'application/xml',
      };
    }
    case 'insert_subiekt': {
      const buffer = generateInsertSubiektCsv({
        issuer: data.issuer,
        periodStart: job.period_start,
        periodEnd: job.period_end,
        issuedInvoices: data.issuedInvoices,
        receivedInvoices: data.receivedInvoices,
      });
      return {
        buffer,
        filename: `Subiekt_${nip}_${periodStr}.csv`,
        mimeType: 'text/csv; charset=Windows-1250',
      };
    }
    case 'symfonia': {
      const buffer = generateSymfoniaCsv({
        issuer: data.issuer,
        periodStart: job.period_start,
        periodEnd: job.period_end,
        issuedInvoices: data.issuedInvoices,
        receivedInvoices: data.receivedInvoices,
      });
      return {
        buffer,
        filename: `Symfonia_${nip}_${periodStr}.csv`,
        mimeType: 'text/csv; charset=UTF-8',
      };
    }
    case 'wapro': {
      const buffer = generateWaproCsv({
        issuer: data.issuer,
        periodStart: job.period_start,
        periodEnd: job.period_end,
        issuedInvoices: data.issuedInvoices,
        receivedInvoices: data.receivedInvoices,
      });
      return {
        buffer,
        filename: `Wapro_${nip}_${periodStr}.csv`,
        mimeType: 'text/csv; charset=UTF-8',
      };
    }
    case 'csv_universal': {
      const buffer = generateUniversalCsv({
        issuer: data.issuer,
        periodStart: job.period_start,
        periodEnd: job.period_end,
        issuedInvoices: data.issuedInvoices,
        receivedInvoices: data.receivedInvoices,
      });
      return {
        buffer,
        filename: `Eksport_${nip}_${periodStr}.csv`,
        mimeType: 'text/csv; charset=UTF-8',
      };
    }
    default: {
      const unexpected: never = format;
      throw new NonRetriableError(
        `Format ${String(unexpected)} not implemented`,
      );
    }
  }
}

function buildR2Path(job: ExportJobRow, exportJobId: string, filename: string) {
  return `exports/${job.tenant_id}/${exportJobId}/${filename}`;
}

// ============================================================================

/** Komunikaty, które wolno pokazać człowiekowi — reszta to szczegóły techniczne. */
const HUMAN_EXPORT_ERRORS = [new MissingTaxOfficeError().message, new MissingTaxpayerEmailError().message];

/**
 * Po wyczerpaniu prób (Inngest `onFailure`, pg-boss `onExhausted`): eksport
 * „nieudany” z powodem. Do 27.09 zostawał w „generating” na zawsze — Centrum
 * eksportu kręciło się bez końca, a Co-Pilot czekał do limitu czasu.
 */
export async function onExportsGenerateExhausted(
  failure: Error,
  data: { exportJobId: string },
): Promise<void> {
  const message = HUMAN_EXPORT_ERRORS.includes(failure.message)
    ? failure.message
    : 'Nie udało się wygenerować pliku. Spróbuj ponownie albo napisz do nas.';
  const { error } = await createAdminClient()
    .from('export_jobs')
    .update({ status: 'failed', error_message: message })
    .eq('id', data.exportJobId)
    .in('status', ['pending', 'generating']);
  if (error) throw new Error(error.message);
}

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-c.ts
 */
export async function runExportsGenerate(eventData: Parameters<typeof exportsGenerateRequested.create>[0], { step }: JobContext) {
    const { exportJobId } = eventData;
    const supabase = createAdminClient();

    const job = await step.run('fetch-job', async () => {
      const { data, error } = await supabase
        .from('export_jobs')
        .select('*')
        .eq('id', exportJobId)
        .single();

      if (error || !data) {
        throw new NonRetriableError(`Export job ${exportJobId} not found`);
      }
      return data as ExportJobRow;
    });

    await step.run('mark-generating', async () => {
      const { error } = await supabase
        .from('export_jobs')
        .update({
          status: 'generating',
          started_at: new Date().toISOString(),
          progress_message: 'Pobieranie danych z bazy...',
        })
        .eq('id', exportJobId);

      if (error) throw new Error(error.message);
    });

    const data = await step.run('fetch-invoices', async () => {
      const direction = resolveExportDirection(job);
      return fetchInvoicesForExport({
        tenantId: job.tenant_id,
        periodStart: job.period_start,
        periodEnd: job.period_end,
        direction,
        includeCorrections: job.include_corrections,
        includeExpenses: job.format === 'kpir_excel' || String(job.format) === 'jpk_v7m',
      });
    });

    const hasExpensesForFormat =
      (job.format === 'kpir_excel' || String(job.format) === 'jpk_v7m') &&
      data.expenses.length > 0;
    if (data.issuedInvoices.length === 0 && data.receivedInvoices.length === 0 &&
        !hasExpensesForFormat) {
      await step.run('mark-empty', async () => {
        const { error } = await supabase
          .from('export_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            invoices_count: 0,
            progress_message: 'Brak faktur w wybranym okresie',
          })
          .eq('id', exportJobId);
        if (error) throw new Error(error.message);
      });
      return { success: true as const, count: 0 };
    }

    // Urząd firmy dla plików JPK — odpornie przed migracją 00092.
    const format = job.format as ExportJobRow['format'] | 'jpk_v7m';
    const taxOfficeCode =
      format === 'jpk_fa' || format === 'jpk_v7m'
        ? await step.run('read-tax-office', () => readTenantTaxOffice(supabase, job.tenant_id))
        : null;
    // JPK_V7M(3) wymaga e-maila podatnika — adres właściciela firmy.
    const taxpayerEmail =
      format === 'jpk_v7m'
        ? await step.run('read-taxpayer-email', () => readTaxpayerEmail(supabase, job.tenant_id))
        : null;
    const fileData = {
      ...data,
      issuer: {
        ...data.issuer,
        taxOfficeCode: taxOfficeCode ?? undefined,
        email: taxpayerEmail ?? undefined,
      },
    };

    // Step 1: generate and upload exactly one byte sequence
    // ─────────────────────────────────────────────────────────────
    // Buffer NIE jest zwracany ze stepu (Inngest serializuje return-value).
    // Po udanym PUT to jego bajty wyznaczają hash. Jeśli poprzednia próba
    // zdążyła zapisać obiekt, czytamy jego rzeczywistą treść do metadanych.
    const fileMeta: GeneratedExportMeta = await step.run(
      'generate-upload',
      async () => {
        let generated: Awaited<ReturnType<typeof generateExportFile>>;
        try {
          generated = await generateExportFile(job, fileData);
        } catch (e) {
          // Ponowienie nic nie da — urząd ustawia człowiek.
          if (e instanceof MissingTaxOfficeError || e instanceof MissingTaxpayerEmailError) {
            throw new NonRetriableError(e.message);
          }
          throw e;
        }
        const r2Path = buildR2Path(job, exportJobId, generated.filename);
        const uploaded = await uploadToR2IfAbsent(
          r2Path,
          generated.buffer,
          generated.mimeType,
        );
        const storedBytes = uploaded
          ? generated.buffer
          : await downloadFromR2(r2Path, job.tenant_id);
        const fileHash = createHash('sha256')
          .update(storedBytes)
          .digest('hex');
        return {
          filename: generated.filename,
          mimeType: generated.mimeType,
          sizeBytes: storedBytes.length,
          fileHash,
        };
      },
    );

    const r2Path = buildR2Path(job, exportJobId, fileMeta.filename);

    // Step 2: persist (UPSERT + UPDATE)
    // ─────────────────────────────────────────────────────────────
    // UPSERT z ON CONFLICT na (export_job_id, filename) — wymaga unique
    // indexu z migracji 00026. Bez niego retry tego stepu po częściowym
    // sukcesie (insert OK, update timeout) zwracałby 23505.
    const persistResult = await step.run('persist', async () => {
      const { error: insertErr } = await supabase
        .from('export_files')
        .upsert(
          {
            export_job_id: exportJobId,
            tenant_id: job.tenant_id,
            filename: fileMeta.filename,
            format: job.format,
            mime_type: fileMeta.mimeType,
            size_bytes: fileMeta.sizeBytes,
            r2_path: r2Path,
            file_hash: fileMeta.fileHash,
          },
          { onConflict: 'export_job_id,filename' },
        );

      if (insertErr) throw new Error(insertErr.message);

      const invoices = [...data.issuedInvoices, ...data.receivedInvoices];
      const invoicesCount = invoices.length;
      const totalNet = invoices.reduce((s, inv) => s + inv.netTotal, 0);
      const totalVat = invoices.reduce((s, inv) => s + inv.vatTotal, 0);
      const totalGross = invoices.reduce((s, inv) => s + inv.grossTotal, 0);

      const { error: updateErr } = await supabase
        .from('export_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress_message: 'Gotowe',
          invoices_count: invoicesCount,
          total_net: totalNet,
          total_vat: totalVat,
          total_gross: totalGross,
        })
        .eq('id', exportJobId);

      if (updateErr) throw new Error(updateErr.message);

      return {
        invoicesCount,
        totalNet,
        totalVat,
        totalGross,
      };
    });

    return {
      success: true as const,
      filename: fileMeta.filename,
      size: fileMeta.sizeBytes,
      invoicesCount: persistResult.invoicesCount,
    };
}

export const exportsGenerateJob = inngest.createFunction(
  {
    id: 'exports-generate',
    name: 'Eksport: generowanie pliku',
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [exportsGenerateRequested],
    onFailure: async ({ error: failure, event }) =>
      onExportsGenerateExhausted(
        failure,
        (event.data.event as { data: { exportJobId: string } }).data,
      ),
  },
  async ({ event, step, logger, attempt }) =>
    runExportsGenerate(event.data as Parameters<typeof exportsGenerateRequested.create>[0], toJobContext({ step, logger, attempt })),
);
