import type { Json } from '@/types/database';
import { NonRetriableError } from 'inngest';

import { logAuditSystem } from '@/lib/audit/log-system';
import { downloadUpoFromKsef } from '@/lib/ksef/upo-client';
import { generateUpoPdf } from '@/lib/ksef/upo-pdf-generator';
import { uploadUpoPdf, uploadUpoXml } from '@/lib/ksef/upo-storage';
import { createAdminClient } from '@/lib/supabase/server';

import { inngest, invoiceUpoRequested } from '../client';

type BuyerBlob = { name?: unknown };

function stringFromBuyerData(buyerData: Json | null): string {
  if (!buyerData || typeof buyerData !== 'object' || Array.isArray(buyerData)) {
    return '';
  }
  const n = (buyerData as BuyerBlob).name;
  return typeof n === 'string' ? n : '';
}

/**
 * Job: pobiera UPO XML z KSeF, wgrywa do R2, generuje PDF pomocniczy.
 *
 * Trigger: `invoice/upo.requested` (np. po `invoice.submit.succeeded`).
 */
export const downloadUpoJob = inngest.createFunction(
  {
    id: 'download-upo',
    name: 'Pobranie UPO z KSeF',
    retries: 5,
    // Per-NIP concurrency: max 3 równoległe pobrania UPO per tenant globalnie
    // przez Inngest. Bez tego, gdy submit wysyła 50 faktur, KSeF /upo dostaje
    // 50 równoległych żądań z jednego NIP-u i rate-limituje całość.
    concurrency: { key: 'event.data.nip', limit: 3 },
    triggers: [invoiceUpoRequested],
  },
  async ({ event, step, logger }) => {
    const { invoiceId, tenantId, ksefNumber } = event.data;

    logger.info('UPO download start', { invoiceId, tenantId, ksefNumber });

    const existingUpo = await step.run('check-existing-upo', async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('upo_receipts')
        .select('id, status, download_attempts')
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data;
    });

    if (existingUpo?.status === 'downloaded') {
      return { skipped: true, reason: 'UPO already downloaded' };
    }

    const supabaseForWrite = (): ReturnType<typeof createAdminClient> =>
      createAdminClient();

    const upoRecord = await step.run('upsert-upo-record', async () => {
      const supabase = supabaseForWrite();

      const acceptedAtFallback = new Date().toISOString();

      if (existingUpo) {
        const { data, error } = await supabase
          .from('upo_receipts')
          .update({
            ksef_number: ksefNumber,
            last_error: null,
            status: 'pending',
          })
          .eq('id', existingUpo.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data;
      }

      const { data, error } = await supabase
        .from('upo_receipts')
        .insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          ksef_number: ksefNumber,
          ksef_acceptance_timestamp: acceptedAtFallback,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    });

    if (!upoRecord) {
      throw new NonRetriableError('Failed to create UPO record');
    }

    const downloadResult = await step.run('download-from-ksef', async () =>
      downloadUpoFromKsef(tenantId, ksefNumber),
    );

    if (!downloadResult.success) {
      await step.run('mark-failed', async () => {
        const supabase = supabaseForWrite();
        const { data: current, error: selErr } = await supabase
          .from('upo_receipts')
          .select('download_attempts')
          .eq('id', upoRecord.id)
          .single();
        if (selErr) throw new Error(selErr.message);

        const { error } = await supabase
          .from('upo_receipts')
          .update({
            status: 'failed',
            last_error: downloadResult.error,
            download_attempts: (current?.download_attempts ?? 0) + 1,
          })
          .eq('id', upoRecord.id);
        if (error) throw new Error(error.message);
      });

      if (downloadResult.retryable) {
        throw new Error(downloadResult.error);
      }
      throw new NonRetriableError(downloadResult.error);
    }

    const xmlPath = await step.run('upload-xml-to-r2', async () =>
      uploadUpoXml(tenantId, invoiceId, downloadResult.upoXml),
    );

    const pdfPath = await step.run('generate-and-upload-pdf', async () => {
      const supabase = supabaseForWrite();

      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .select('internal_number, issue_date, gross_total, buyer_data, buyer_nip, seller_nip, tenants(name, nip)')
        .eq('id', invoiceId)
        .single();

      if (invErr || !invoice) {
        throw new NonRetriableError(invErr?.message ?? 'Invoice not found');
      }

      const tenants = invoice.tenants as
        | { name: string; nip: string }
        | { name: string; nip: string }[]
        | null;
      const tenantRow = Array.isArray(tenants) ? tenants[0] : tenants;

      const sellerName = tenantRow?.name ?? '';
      const sellerNip = tenantRow?.nip ?? invoice.seller_nip ?? '';
      const buyerName = stringFromBuyerData(invoice.buyer_data);
      const buyerNip = invoice.buyer_nip ?? '';

      const pdfBuffer = await generateUpoPdf({
        ksefNumber,
        invoiceNumber: invoice.internal_number,
        issueDate: invoice.issue_date,
        sellerName,
        sellerNip,
        buyerName,
        buyerNip,
        grossAmount: Number(invoice.gross_total ?? 0),
        acceptanceTimestamp: downloadResult.acceptanceTimestamp,
        upoId: downloadResult.upoId,
        upoXmlHash: downloadResult.upoXmlHash,
      });

      return uploadUpoPdf(tenantId, invoiceId, pdfBuffer);
    });

    await step.run('finalize-upo-record', async () => {
      const supabase = supabaseForWrite();
      const { error } = await supabase
        .from('upo_receipts')
        .update({
          status: 'downloaded',
          upo_xml_path: xmlPath,
          upo_pdf_path: pdfPath,
          upo_xml_hash: downloadResult.upoXmlHash,
          upo_id: downloadResult.upoId ?? null,
          ksef_acceptance_timestamp: downloadResult.acceptanceTimestamp,
          downloaded_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', upoRecord.id);
      if (error) throw new Error(error.message);
    });

    await step.run('audit-log', async () => {
      await logAuditSystem({
        tenantId,
        action: 'invoice.upo_downloaded',
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: {
          ksefNumber,
          upoId: downloadResult.upoId,
          xmlPath,
          pdfPath,
        },
      });
    });

    return {
      success: true,
      ksefNumber,
      xmlPath,
      pdfPath,
    };
  },
);
