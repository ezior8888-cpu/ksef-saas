/**
 * Inngest: OCR zdjęcia wydatku (R2 → Claude Vision → kategoria KPiR → `expenses`).
 */

import { NonRetriableError } from 'inngest';

import { categorizeExpense } from '@/lib/categorization';
import { extractInvoiceFromImage } from '@/lib/ocr/engine';
import {
  extractedInvoiceSchema,
  type ExtractedInvoice,
} from '@/lib/ocr/schema';
import { sendPushToUser } from '@/lib/push/sender';
import { createAdminClient } from '@/lib/supabase/admin';
import { downloadExpensePhoto } from '@/lib/storage/expenses';
import type { Database, Json } from '@/types/database';

import { inngest, ocrProcessPhotoRequested } from '../client';

type OcrJobRow = Database['public']['Tables']['ocr_jobs']['Row'];

function extractedInvoiceToJson(data: ExtractedInvoice): Json {
  return JSON.parse(JSON.stringify(data)) as Json;
}

export const processOcrJob = inngest.createFunction(
  {
    id: 'process-ocr-photo',
    name: 'OCR: rozpoznanie wydatku ze zdjęcia',
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [ocrProcessPhotoRequested],
  },
  async ({ event, step }) => {
    const { ocrJobId, tenantId } = ocrProcessPhotoRequested.parse(event.data);
    const supabase = createAdminClient();

    await step.run('mark-processing', async () => {
      const { error } = await supabase
        .from('ocr_jobs')
        .update({ status: 'processing' })
        .eq('id', ocrJobId)
        .eq('tenant_id', tenantId);

      if (error) throw new Error(error.message);
    });

    const { job, imageBase64, mimeType } = await step.run(
      'fetch-input',
      async () => {
        const { data: row, error } = await supabase
          .from('ocr_jobs')
          .select('*')
          .eq('id', ocrJobId)
          .eq('tenant_id', tenantId)
          .single();

        if (error || !row) {
          throw new NonRetriableError('Job nie istnieje lub niewłaściwy tenant');
        }

        const jobRow = row as OcrJobRow;
        if (!jobRow.source_file_path || jobRow.source_file_path === 'pending') {
          throw new NonRetriableError('Brak pliku źródłowego dla joba OCR');
        }

        const { buffer, mimeType: mt } = await downloadExpensePhoto(
          jobRow.source_file_path,
        );

        return {
          job: jobRow,
          imageBase64: buffer.toString('base64'),
          mimeType: mt,
        };
      },
    );

    const ocrResult = await step.run('claude-vision-ocr', async () => {
      return extractInvoiceFromImage(imageBase64, mimeType);
    });

    if (!ocrResult.success || !ocrResult.data) {
      await step.run('mark-failed', async () => {
        const { error } = await supabase
          .from('ocr_jobs')
          .update({
            status: 'failed',
            error_message: ocrResult.error ?? 'OCR failed',
            ai_input_tokens: ocrResult.inputTokens,
            ai_output_tokens: ocrResult.outputTokens,
            processing_time_ms: ocrResult.processingTimeMs,
            completed_at: new Date().toISOString(),
          })
          .eq('id', ocrJobId)
          .eq('tenant_id', tenantId);

        if (error) throw new Error(error.message);
      });

      await sendPushToUser(job.created_by, 'invoice_rejected', {
        title: '❌ Nie udało się rozpoznać paragonu',
        body:
          ocrResult.error?.slice(0, 80) ??
          'Spróbuj ponownie z lepszym zdjęciem',
        url: '/expenses',
        tag: `ocr-${ocrJobId}`,
      });

      return { success: false as const };
    }

    const extractedData = extractedInvoiceSchema.parse(ocrResult.data);

    const categorization = await step.run('categorize', async () => {
      return categorizeExpense(tenantId, extractedData);
    });

    const expenseId = await step.run('create-expense', async () => {
      const data = extractedData;
      const docType =
        data.document_type === 'simplified_invoice' ? 'invoice' : data.document_type;

      const { data: expense, error } = await supabase
        .from('expenses')
        .insert({
          tenant_id: tenantId,
          created_by: job.created_by,
          source: 'ocr_photo',
          ocr_job_id: ocrJobId,
          seller_name: data.seller_name,
          seller_nip: data.seller_nip,
          seller_address: data.seller_address,
          document_number: data.document_number,
          document_type: docType,
          issue_date: data.issue_date,
          net_amount: data.net_amount,
          vat_amount: data.vat_amount,
          gross_amount: data.gross_amount,
          vat_rate: data.vat_rate,
          vat_deductible_amount: data.vat_amount,
          kpir_column: categorization.kpir_column,
          category_label: categorization.category_label,
          categorization_method: categorization.method,
          categorization_confidence: categorization.confidence,
          source_file_path: job.source_file_path,
          source_file_mime: job.source_file_mime,
          ocr_extracted_data: extractedInvoiceToJson(data),
          is_reviewed: false,
        })
        .select('id')
        .single();

      if (error || !expense) {
        throw new Error(error?.message ?? 'Insert failed');
      }
      return expense.id;
    });

    await step.run('mark-completed', async () => {
      const { error } = await supabase
        .from('ocr_jobs')
        .update({
          status: 'completed',
          extracted_data: extractedInvoiceToJson(extractedData),
          expense_id: expenseId,
          ai_model_used: ocrResult.modelUsed,
          ai_input_tokens: ocrResult.inputTokens,
          ai_output_tokens: ocrResult.outputTokens,
          processing_time_ms: ocrResult.processingTimeMs,
          completed_at: new Date().toISOString(),
        })
        .eq('id', ocrJobId)
        .eq('tenant_id', tenantId);

      if (error) throw new Error(error.message);
    });

    await step.run('notify-user', async () => {
      await sendPushToUser(job.created_by, 'invoice_accepted', {
        title: '📸 Wydatek rozpoznany',
        body: `${extractedData.seller_name} • ${extractedData.gross_amount.toFixed(2)} PLN`,
        url: `/expenses/${expenseId}`,
        tag: `ocr-${ocrJobId}`,
      });
    });

    return { success: true as const, expenseId };
  },
);
