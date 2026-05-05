// lib/inngest/jobs/exports-generate.ts
// Inngest: generuje plik exportu i zapisuje w R2.
//
// Flow rozbity na trzy memoizowane przez Inngest stepy:
//
//   1. generate-buffer — generuje plik w pamięci, liczy SHA-256, zwraca tylko
//      meta-dane (filename / mimeType / sizeBytes / fileHash). Buffer NIE jest
//      serializowany do Inngest store'u (default limit ~64 KB na step memo,
//      a XML/Excel/CSV potrafią mieć MB-y; do tego niepotrzebnie wystawiamy
//      treść biznesową w cudzej bazie).
//
//   2. upload-r2 — HEAD do R2, jeśli klucz już istnieje pomijamy upload (retry-
//      safe), w przeciwnym razie regenerujemy bufor (deterministycznie z DB)
//      i wgrywamy. Step jest idempotentny: dwa równoległe runy nie nadpiszą
//      się nawzajem niczym z innym hashem (deterministyczny generator), a
//      drugi run kończy się no-op.
//
//   3. persist — UPSERT export_files z ON CONFLICT (export_job_id, filename)
//      + UPDATE export_jobs.status = 'completed'. Wymaga unique indexu
//      `uq_export_files_job_filename` z migracji 00026.

import { createHash } from 'node:crypto';

import { NonRetriableError } from 'inngest';

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
import { generateKpirXlsx } from '@/lib/exports/kpir-generator';
import { createAdminClient } from '@/lib/supabase/admin';
import { r2ObjectExists, uploadToR2 } from '@/lib/storage/r2';

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

/**
 * Pure: model -> Buffer + metadane. Wywoływane DWA razy w cold-path (raz
 * w `generate-buffer` dla policzenia hashu, raz w `upload-r2` przy faktycznym
 * uploadzie). Generatory są deterministyczne — ten sam input daje ten sam
 * SHA-256, więc HEAD-then-skip + ewentualny IfNoneMatch w R2 trzymają nas
 * po bezpiecznej stronie.
 */
async function generateExportFile(
  job: ExportJobRow,
  data: FetchedInvoiceData,
): Promise<GeneratedExportFile> {
  const periodStr = `${job.period_start}_${job.period_end}`;
  const nip = safeNip(data.issuer.nip);

  switch (job.format) {
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
        receivedInvoices: data.receivedInvoices,
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
      const unexpected: never = job.format;
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

export const exportsGenerateJob = inngest.createFunction(
  {
    id: 'exports-generate',
    name: 'Eksport: generowanie pliku',
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [exportsGenerateRequested],
  },
  async ({ event, step }) => {
    const { exportJobId } = event.data;
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
      });
    });

    if (data.issuedInvoices.length === 0 && data.receivedInvoices.length === 0) {
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

    // Step 1: generate-buffer
    // ─────────────────────────────────────────────────────────────
    // Pamięciowy generate + SHA-256. Buffer NIE jest zwracany ze stepu
    // (Inngest serializuje return-value, a multi-MB JSON byłby kosztowny
    // i niepotrzebnie eksponowałby treść faktur w event store).
    const fileMeta: GeneratedExportMeta = await step.run(
      'generate-buffer',
      async () => {
        const generated = await generateExportFile(job, data);
        const fileHash = createHash('sha256')
          .update(generated.buffer)
          .digest('hex');
        return {
          filename: generated.filename,
          mimeType: generated.mimeType,
          sizeBytes: generated.buffer.length,
          fileHash,
        };
      },
    );

    const r2Path = buildR2Path(job, exportJobId, fileMeta.filename);

    // Step 2: upload-r2 (idempotent przez HEAD)
    // ─────────────────────────────────────────────────────────────
    // HEAD najpierw — jeśli klucz już istnieje (np. po retry po crashu
    // pomiędzy uploadem a persist), nie wgrywamy ponownie. Generatory
    // FA(3)/JPK_FA są deterministyczne (ten sam input → ten sam SHA-256),
    // więc istniejący obiekt ma identyczną zawartość.
    await step.run('upload-r2', async () => {
      const exists = await r2ObjectExists(r2Path);
      if (exists) return { skipped: true as const };

      const generated = await generateExportFile(job, data);
      await uploadToR2(r2Path, generated.buffer, generated.mimeType);
      return { skipped: false as const };
    });

    // Step 3: persist (UPSERT + UPDATE)
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
  },
);
