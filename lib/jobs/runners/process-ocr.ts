import { requireTenantMember } from './tenant-boundary';
/**
 * Inngest: OCR zdjęcia wydatku (R2 → Claude Vision → kategoria KPiR → `expenses`).
 */

import { NonRetriableError } from '../errors';
import type { JobContext } from '@/lib/jobs/registry';

import { categorizeExpense } from '@/lib/categorization';
import { createProposal } from '@/lib/flo/proposals';
import {
  buildExpenseReviewProposal,
  buildOcrFailedProposal,
  readSellerHistory,
} from '@/lib/flo/functions/expense-review';
import { extractInvoiceFromImage } from '@/lib/ocr/engine';
import { checkTenantAiBudget, recordTenantAiUsage } from '@/lib/ai/tenant-ai-budget';
import {
  extractedInvoiceSchema,
  type ExtractedInvoice,
} from '@/lib/ocr/schema';
import type { RateStamp } from '@/lib/flo/nbp';
import { nbpRateForCost } from '@/lib/nbp/client';
import { costInPln, documentCurrency, HOME_CURRENCY } from '@/lib/ocr/currency';
import { sendPushToUser } from '@/lib/push/sender';
import { isSubjectiveVatExemption, readTenantVatExemption } from '@/lib/invoices/vat-exemption';
import { createAdminClient } from '@/lib/supabase/admin';
import { downloadExpensePhoto } from '@/lib/storage/expenses';
import type { Database, Json } from '@/types/database';

import { ocrProcessPhotoRequested } from '../events';

type OcrJobRow = Database['public']['Tables']['ocr_jobs']['Row'];

function extractedInvoiceToJson(data: ExtractedInvoice, fx: RateStamp | null = null): Json {
  return JSON.parse(JSON.stringify(fx ? { ...data, fx } : data)) as Json;
}

/**
 * Wydatek zapisany już z tego zadania OCR w tej firmie (albo `null`).
 * Błąd odczytu rzuca — job nie może wtedy zapisać ani ogłosić porażki
 * „w ciemno”. `limit(1)`: dawne duble (sprzed B4) nie mogą zablokować joba.
 */
async function findOcrJobExpense(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  ocrJobId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('ocr_job_id', ocrJobId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Nie można sprawdzić, czy wydatek już istnieje: ${error.message}`);
  }
  return data?.id ?? null;
}

/**
 * Obsługa po wyczerpaniu prób (Etap 7): wspólna dla Inngest `onFailure`
 * i pg-boss `onExhausted` — oznacza job OCR jako nieudany, żeby UI przestało
 * pokazywać „przetwarzanie" i user mógł wpisać dane ręcznie.
 */
export async function onProcessOcrExhausted(
  error: Error,
  data: { ocrJobId: string; tenantId: string },
): Promise<void> {
  const { ocrJobId, tenantId } = data;
  const supabase = createAdminClient();

  // Wydatek mógł już powstać, a na stałe padł dopiero krok po zapisie (karta
  // agenta, powiadomienie — np. autor zdjęcia odszedł z firmy). „Nieudane”
  // kazałoby klientowi wpisać paragon ręcznie, czyli drugi raz do KPiR.
  // Wtedy zadanie kończy się wskazaniem na zapisany wydatek.
  const { data: saved } = await supabase
    .from('expenses')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('ocr_job_id', ocrJobId)
    .limit(1)
    .maybeSingle();
  if (saved) {
    await supabase
      .from('ocr_jobs')
      .update({ status: 'completed', expense_id: saved.id, completed_at: new Date().toISOString() })
      .eq('id', ocrJobId)
      .eq('tenant_id', tenantId);
    return;
  }

  await supabase
    .from('ocr_jobs')
    .update({
      status: 'failed',
      error_message:
        error.message?.slice(0, 500) ||
        'Nie udało się rozpoznać paragonu. Spróbuj ponownie lub wprowadź dane ręcznie.',
      completed_at: new Date().toISOString(),
    })
    .eq('id', ocrJobId)
    .eq('tenant_id', tenantId);
}

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-c.ts
 */
export async function runProcessOcr(data: Parameters<typeof ocrProcessPhotoRequested.create>[0], { step }: JobContext) {
    const { ocrJobId, tenantId } = ocrProcessPhotoRequested.parse(data);
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
        // Autor usunął konto (AUD-41: created_by = NULL) — koszt nie ma autora.
        const createdBy = jobRow.created_by;
        if (!createdBy) throw new NonRetriableError('Autor zadania OCR usunął konto');
        await requireTenantMember(createdBy, tenantId);
        if (!jobRow.source_file_path || jobRow.source_file_path === 'pending') {
          throw new NonRetriableError('Brak pliku źródłowego dla joba OCR');
        }

        const { buffer, mimeType: mt } = await downloadExpensePhoto(
          jobRow.source_file_path,
          tenantId,
        );

        return {
          job: { ...jobRow, created_by: createdBy },
          imageBase64: buffer.toString('base64'),
          mimeType: mt,
        };
      },
    );

    // AUD-107: budżet AI firmy PRZED wywołaniem modelu — po fakcie limit
    // byłby tylko statystyką.
    const aiBudget = await step.run('ai-budget', () => checkTenantAiBudget(tenantId, 'ocr'));
    const ocrResult = aiBudget.allowed
      ? await step.run('claude-vision-ocr', async () => {
          return extractInvoiceFromImage(imageBase64, mimeType);
        })
      : { success: false as const, error: aiBudget.message, inputTokens: 0, outputTokens: 0, processingTimeMs: 0 };
    if (aiBudget.allowed) {
      await step.run('ai-usage', () =>
        recordTenantAiUsage(tenantId, { inputTokens: ocrResult.inputTokens, outputTokens: ocrResult.outputTokens }),
      );
    }

    if (!ocrResult.success || !ocrResult.data) {
      // Ponowienie po zapisie (pg-boss powtarza cały job): wydatek już jest,
      // a OCR tym razem zawiódł — np. pierwszy przebieg zużył resztę budżetu
      // AI firmy. „Nie rozpoznano” z kartą „wpisz ręcznie” skończyłoby się
      // drugim kosztem w KPiR (B4). Zadanie wskazuje zapisany wydatek, jak
      // w `onProcessOcrExhausted`.
      const savedExpenseId = await step.run('find-saved-expense', () =>
        findOcrJobExpense(supabase, tenantId, ocrJobId),
      );
      if (savedExpenseId) {
        await step.run('mark-completed-saved', async () => {
          const { error } = await supabase
            .from('ocr_jobs')
            .update({ status: 'completed', expense_id: savedExpenseId, completed_at: new Date().toISOString() })
            .eq('id', ocrJobId)
            .eq('tenant_id', tenantId);

          if (error) throw new Error(error.message);
        });
        return { success: true as const, expenseId: savedExpenseId };
      }

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

      await requireTenantMember(job.created_by, tenantId);
      await sendPushToUser(job.created_by, 'invoice_rejected', {
        title: '❌ Nie udało się rozpoznać paragonu',
        body:
          ocrResult.error?.slice(0, 80) ??
          'Spróbuj ponownie z lepszym zdjęciem',
        url: '/expenses',
        tag: `ocr-${ocrJobId}`,
      });

      // Karta agenta zamiast samego powiadomienia: powiadomienie znika,
      // a klient musi wiedzieć, że zdjęcie ZOSTAŁO w archiwum. Bez tego
      // wyrzuca paragon i po miesiącu nie ma czego odtwarzać.
      await step.run('flo-failed-card', async () => {
        await createProposal(buildOcrFailedProposal(tenantId, ocrJobId));
      });

      return { success: false as const };
    }

    const extractedData = extractedInvoiceSchema.parse(ocrResult.data);

    // Dokument w walucie obcej → kurs średni NBP z ostatniego dnia roboczego
    // PRZED datą dokumentu (art. 11a ust. 2 PIT). Błąd sieci rzuca (ponowienie);
    // brak tabeli albo nieznana waluta to wynik — koszt nie wejdzie do KPiR.
    const currency = documentCurrency(extractedData);
    const fxLookup =
      currency === HOME_CURRENCY
        ? null
        : await step.run('nbp-rate', () => nbpRateForCost(currency, extractedData.issue_date));
    const cost = costInPln(extractedData, extractedData.issue_date, fxLookup);
    const plnOrDocument =
      cost.kind === 'pln'
        ? { net: cost.net, vat: cost.vat, gross: cost.gross }
        : { net: extractedData.net_amount, vat: extractedData.vat_amount, gross: extractedData.gross_amount };

    const categorization = await step.run('categorize', async () => {
      return categorizeExpense(tenantId, extractedData);
    });

    const expenseId = await step.run('create-expense', async () => {
      // Ponowienie (pg-boss bez pamięci kroków) wykonuje cały job od nowa.
      // Gdy zapis się udał, a padł późniejszy krok (oznaczenie zadania, karta
      // agenta, powiadomienie), drugi przebieg dopisywał ten sam paragon
      // jeszcze raz — koszt w KPiR liczył się podwójnie.
      const existingId = await findOcrJobExpense(supabase, tenantId, ocrJobId);
      if (existingId) return existingId;

      const data = extractedData;
      const docType =
        data.document_type === 'simplified_invoice' ? 'invoice' : data.document_type;
      // Firma zwolniona z VAT (#60) nie odlicza VAT-u: koszt w KPiR wychodzi
      // wtedy brutto (#65), a JPK nic nie odlicza. Odczyt odporny przed 00091.
      // Tylko zwolnienie podmiotowe (art. 113) odbiera odliczenie — I2, AUD-68.
      const vatExempt = isSubjectiveVatExemption(await readTenantVatExemption(supabase, tenantId));

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
          // Złote: z dokumentu albo przeliczone kursem NBP (`costInPln`).
          net_amount: plnOrDocument.net,
          vat_amount: plnOrDocument.vat,
          gross_amount: plnOrDocument.gross,
          vat_rate: data.vat_rate,
          // Waluta obca: VAT z dokumentu nie idzie do odliczenia automatycznie.
          vat_deductible_amount:
            cost.kind === 'missing_rate' ? 0 : (cost.vatDeductible ?? (vatExempt ? 0 : data.vat_amount)),
          // Bez kursu kwoty są w walucie dokumentu — nie wolno ich liczyć do KPiR.
          ...(cost.kind === 'missing_rate' ? { is_deductible: false } : {}),
          notes: cost.note,
          kpir_column: categorization.kpir_column,
          category_label: categorization.category_label,
          categorization_method: categorization.method,
          categorization_confidence: categorization.confidence,
          source_file_path: job.source_file_path,
          source_file_mime: job.source_file_mime,
          // Oryginał z dokumentu + ślad kursu (tabela, data) — do obrony przy kontroli.
          ocr_extracted_data: extractedInvoiceToJson(data, cost.kind === 'pln' ? cost.fx : null),
          is_reviewed: false,
        })
        .select('id')
        .single();

      // Odczyt wyżej nie rozstrzyga wyścigu dwóch równoczesnych przebiegów
      // (wygaśnięcie / utrata heartbeatu w pg-boss). Rozstrzyga go indeks
      // UNIQUE (tenant_id, ocr_job_id) — prośba B4 do Bartosza — a 23505
      // wymaga ponownego odczytu dokładnie tego zadania w tej firmie.
      if (error?.code === '23505') {
        const concurrentId = await findOcrJobExpense(supabase, tenantId, ocrJobId);
        if (!concurrentId) {
          throw new Error(`Konflikt UNIQUE nie dotyczy wydatku z tego zadania OCR: ${error.message}`);
        }
        return concurrentId;
      }
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

    // Karta agenta. Decyduje o tym, czy klient zobaczy meldunek („zaksięgowałem"),
    // czy pytanie („do sprawdzenia") — reguły w lib/flo/functions/expense-review.ts.
    await step.run('flo-review-card', async () => {
      const history = await readSellerHistory(tenantId, extractedData.seller_name);

      await createProposal(
        buildExpenseReviewProposal({
          tenantId,
          expenseId,
          facts: {
            sellerName: extractedData.seller_name,
            sellerNip: extractedData.seller_nip,
            netAmount: plnOrDocument.net,
            vatAmount: plnOrDocument.vat,
            grossAmount: plnOrDocument.gross,
            issueDate: extractedData.issue_date,
            confidence: extractedData.ocr_confidence,
            categoryLabel: categorization.category_label,
          },
          history,
          applied: {
            kpirColumn: categorization.kpir_column,
            categoryLabel: categorization.category_label,
          },
        }),
      );
    });

    await step.run('notify-user', async () => {
      await requireTenantMember(job.created_by, tenantId);
      await sendPushToUser(job.created_by, 'invoice_accepted', {
        title: '📸 Wydatek rozpoznany',
        body: `${extractedData.seller_name} • ${
          cost.kind === 'pln' ? `${cost.gross.toFixed(2)} PLN` : `${extractedData.gross_amount.toFixed(2)} ${currency} (bez kursu)`
        }`,
        url: `/expenses/${expenseId}`,
        tag: `ocr-${ocrJobId}`,
      });
    });

    return { success: true as const, expenseId };
}

