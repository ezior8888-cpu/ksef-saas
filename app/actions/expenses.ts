'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/log';
import { sendJobEvent } from '@/lib/jobs/enqueue';

import { learnFromCorrection } from '@/lib/categorization';
import { deductibleAfterVatChange } from '@/lib/categorization/vat-deduction';
import { hasKsefCurrencyRate } from '@/lib/expenses/ksef-currency-review';
import { formatInngestSendError } from '@/lib/inngest/error-message';
import {
  ocrProcessPhotoRequested,
} from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import { requireUserAndActiveOrg } from '@/lib/supabase/auth-context';
import { deleteExpensePhoto, uploadExpensePhoto } from '@/lib/storage/expenses';
import type { Database } from '@/types/database';

type ExpenseReviewUpdates = {
  kpir_column?: string;
  category_label?: string;
  is_deductible?: boolean;
  notes?: string;
  seller_name?: string;
  seller_nip?: string | null;
  document_number?: string;
  issue_date?: string;
  net_amount?: number;
  vat_amount?: number;
  gross_amount?: number;
  /** Potwierdzenie porównania walutowej faktury KSeF z XML i kwotami PLN. */
  confirmForeignCurrencyReview?: boolean;
};

function buildExpenseUpdatePatch(
  updates: ExpenseReviewUpdates,
  categoryChanged: boolean,
): Database['public']['Tables']['expenses']['Update'] {
  const patch: Database['public']['Tables']['expenses']['Update'] = {
    is_reviewed: true,
  };

  if (updates.kpir_column !== undefined) {
    patch.kpir_column = updates.kpir_column as Database['public']['Enums']['kpir_column'];
  }
  if (updates.category_label !== undefined) {
    patch.category_label = updates.category_label;
  }
  if (updates.is_deductible !== undefined) {
    patch.is_deductible = updates.is_deductible;
  }
  if (updates.notes !== undefined) {
    patch.notes = updates.notes;
  }
  if (updates.seller_name !== undefined) {
    patch.seller_name = updates.seller_name;
  }
  if (updates.seller_nip !== undefined) {
    patch.seller_nip = updates.seller_nip;
  }
  if (updates.document_number !== undefined) {
    patch.document_number = updates.document_number;
  }
  if (updates.issue_date !== undefined) {
    patch.issue_date = updates.issue_date;
  }
  if (updates.net_amount !== undefined) {
    patch.net_amount = updates.net_amount;
  }
  if (updates.vat_amount !== undefined) {
    patch.vat_amount = updates.vat_amount;
  }
  if (updates.gross_amount !== undefined) {
    patch.gross_amount = updates.gross_amount;
  }
  if (categoryChanged) {
    patch.categorization_method = 'manual';
  }

  return patch;
}

/**
 * Upload zdjęcia + trigger OCR job.
 * Zwraca ocrJobId który można pollować.
 */
export async function uploadExpensePhotoAction(formData: FormData) {
  // Ten job zapisujemy admin clientem (omija RLS), więc tenant MUSI być
  // zweryfikowany przez membership — nie samym formatem cookie. Inaczej
  // spreparowane cookie z obcym org_id pozwoliłoby wstrzyknąć OCR job do
  // cudzej organizacji.
  let auth;
  try {
    auth = await requireUserAndActiveOrg();
  } catch {
    return { success: false as const, error: 'Brak autoryzacji' };
  }
  const { user, tenantId } = auth;

  const file = formData.get('photo');
  if (!(file instanceof File)) {
    return { success: false as const, error: 'Brak pliku' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { success: false as const, error: 'Plik za duży (max 10 MB)' };
  }

  const admin = createAdminClient();
  const { data: ocrJob, error: jobError } = await admin
    .from('ocr_jobs')
    .insert({
      tenant_id: tenantId,
      created_by: user.id,
      status: 'pending',
      source_file_path: 'pending',
      source_file_mime: file.type || 'application/octet-stream',
      source_file_size_bytes: file.size,
    })
    .select('id')
    .single();

  if (jobError || !ocrJob) {
    return { success: false as const, error: 'Błąd zapisu joba' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let r2Key: string | null = null;

  try {
    r2Key = await uploadExpensePhoto(
      tenantId,
      ocrJob.id,
      buffer,
      file.type || 'application/octet-stream',
    );

    const { error: pathErr } = await admin
      .from('ocr_jobs')
      .update({ source_file_path: r2Key })
      .eq('id', ocrJob.id);

    if (pathErr) {
      await deleteExpensePhoto(r2Key);
      await admin.from('ocr_jobs').delete().eq('id', ocrJob.id);
      return { success: false as const, error: pathErr.message };
    }

    await sendJobEvent(
      ocrProcessPhotoRequested.create({
        ocrJobId: ocrJob.id,
        tenantId,
      }),
    );
  } catch (e) {
    if (r2Key) {
      try {
        await deleteExpensePhoto(r2Key);
      } catch {
        // best-effort — nie blokuj zwrotki
      }
    }
    await admin.from('ocr_jobs').delete().eq('id', ocrJob.id);
    return {
      success: false as const,
      error: formatInngestSendError(e),
    };
  }

  revalidatePath('/expenses');
  return { success: true as const, ocrJobId: ocrJob.id };
}

/**
 * Sprawdź status OCR joba (do pollowania z UI).
 */
export async function getOcrJobStatusAction(ocrJobId: string) {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from('ocr_jobs')
    .select('id, status, error_message, expense_id, extracted_data')
    .eq('id', ocrJobId)
    .maybeSingle();

  if (!job) return { success: false as const, error: 'Job nie istnieje' };

  return { success: true as const, job };
}

/**
 * Zaakceptuj/popraw expense — jeśli user zmienił kategorię, ucz się.
 */
export async function reviewExpenseAction(
  expenseId: string,
  updates: ExpenseReviewUpdates,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: 'Brak autoryzacji' };

  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) {
    return { success: false as const, error: 'Brak aktywnej organizacji' };
  }

  const { data: existing } = await supabase
    .from('expenses')
    .select('seller_nip, seller_name, kpir_column, category_label, vat_amount, vat_deductible_amount, is_deductible, source, ksef_invoice_id, issue_date, ocr_extracted_data')
    .eq('id', expenseId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!existing) {
    return { success: false as const, error: 'Wydatek nie istnieje' };
  }

  // Dotyczy także historycznych kosztów bez nowego śladu FX: źródłem prawdy
  // jest waluta powiązanej faktury, a nie opcjonalny JSON przy wydatku.
  let reviewedForeignCurrency: string | null = null;
  let excludedWithoutCurrencyReview = false;
  let missingKsefFxRate = false;
  if (existing.source === 'ksef_inbox') {
    const { data: invoice, error: invoiceError } = existing.ksef_invoice_id
      ? await supabase
        .from('invoices')
        .select('currency')
        .eq('id', existing.ksef_invoice_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      : { data: null, error: null };
    const currency = invoice?.currency?.trim().toUpperCase();
    if (invoiceError || !currency || !/^[A-Z]{3}$/.test(currency)) {
      // Bez źródłowej waluty dopuszczamy wyłącznie bezpieczne wyłączenie
      // historycznego kosztu z KPiR; dalsze zatwierdzanie czeka na operatora.
      if (updates.is_deductible !== false) {
        return { success: false as const, error: 'Nie można potwierdzić waluty faktury KSeF' };
      }
      reviewedForeignCurrency = 'unknown';
      excludedWithoutCurrencyReview = true;
    } else if (currency !== 'PLN') {
      reviewedForeignCurrency = currency;
      missingKsefFxRate = !hasKsefCurrencyRate(
        existing.ocr_extracted_data,
        currency,
        updates.issue_date ?? existing.issue_date,
      );
      excludedWithoutCurrencyReview = updates.is_deductible === false
        && (missingKsefFxRate || updates.confirmForeignCurrencyReview !== true);
      if (!excludedWithoutCurrencyReview && updates.confirmForeignCurrencyReview !== true) {
        return {
          success: false as const,
          error: 'Przed zatwierdzeniem wydatku walutowego sprawdź XML, kurs i kwoty PLN oraz potwierdź to w formularzu',
        };
      }
      if ((updates.is_deductible ?? existing.is_deductible) === true && missingKsefFxRate) {
        return {
          success: false as const,
          error: 'Brak potwierdzonego kursu przy tym koszcie KSeF. Nie można włączyć kwot w walucie obcej do KPiR.',
        };
      }
    }
  }

  const kpirChanged =
    updates.kpir_column !== undefined &&
    updates.kpir_column !== existing.kpir_column;
  const labelChanged =
    updates.category_label !== undefined &&
    updates.category_label !== existing.category_label;
  const categoryChanged = kpirChanged || labelChanged;

  const patch = buildExpenseUpdatePatch(updates, categoryChanged);
  if (excludedWithoutCurrencyReview || missingKsefFxRate) patch.is_reviewed = false;

  // Formularz wysyła VAT zawsze — odliczenie liczymy od nowa tylko przy
  // faktycznej zmianie, inaczej JPK_V7M odliczałby odczyt OCR.
  const vatBefore = Number(existing.vat_amount ?? 0);
  if (updates.vat_amount !== undefined && updates.vat_amount !== vatBefore) {
    patch.vat_deductible_amount = deductibleAfterVatChange(
      { vat: vatBefore, deductible: Number(existing.vat_deductible_amount ?? 0) },
      updates.vat_amount,
    );
  }

  const { data: updated, error } = await supabase
    .from('expenses')
    .update(patch)
    .eq('id', expenseId)
    .eq('tenant_id', tenantId)
    .select('id')
    .maybeSingle();

  if (error) return { success: false as const, error: error.message };
  if (!updated) {
    return { success: false as const, error: 'Wydatek nie istnieje' };
  }

  if (reviewedForeignCurrency) {
    await logAudit({
      action: (excludedWithoutCurrencyReview || missingKsefFxRate)
        ? 'expense.foreign_currency_excluded'
        : 'expense.foreign_currency_reviewed',
      tenantId,
      userId: user.id,
      entityType: 'expense',
      entityId: expenseId,
      metadata: {
        currency: reviewedForeignCurrency,
        includedInKpir: updates.is_deductible ?? existing.is_deductible,
      },
    });
  }

  const resolvedKpir = updates.kpir_column ?? existing.kpir_column;
  const resolvedLabel = updates.category_label ?? existing.category_label;

  if (
    categoryChanged &&
    resolvedKpir != null &&
    resolvedLabel != null &&
    resolvedLabel !== ''
  ) {
    try {
      await learnFromCorrection(tenantId, {
        seller_nip: updates.seller_nip ?? existing.seller_nip,
        seller_name: updates.seller_name ?? existing.seller_name,
        kpir_column: resolvedKpir,
        category_label: resolvedLabel,
      });
    } catch {
      // Wyjątek może zawierać dane formularza lub odpowiedź bazy.
      console.error('[expenses] learnFromCorrection failed');
    }
  }

  revalidatePath('/expenses');
  revalidatePath(`/expenses/${expenseId}`);
  revalidatePath('/reports/kpir');
  return { success: true as const };
}

export async function deleteExpenseAction(expenseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: 'Brak autoryzacji' };

  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) {
    return { success: false as const, error: 'Brak aktywnej organizacji' };
  }

  const { error, count } = await supabase
    .from('expenses')
    .delete({ count: 'exact' })
    .eq('id', expenseId)
    .eq('tenant_id', tenantId);

  if (error) {
    return {
      success: false as const,
      error: error.code === '42501'
        ? 'Koszt powiązany z KSeF pozostaje jako ślad faktury. Możesz wyłączyć go z KPiR.'
        : error.message,
    };
  }
  if (count === 0) {
    return { success: false as const, error: 'Wydatek nie istnieje' };
  }

  revalidatePath('/expenses');
  return { success: true as const };
}
