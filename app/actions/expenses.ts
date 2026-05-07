'use server';

import { revalidatePath } from 'next/cache';

import { learnFromCorrection } from '@/lib/categorization';
import { formatInngestSendError } from '@/lib/inngest/error-message';
import {
  inngest,
  ocrProcessPhotoRequested,
} from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: 'Brak autoryzacji' };

  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) {
    return { success: false as const, error: 'Brak aktywnej organizacji' };
  }

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

    await inngest.send(
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
    .select('seller_nip, seller_name, kpir_column, category_label')
    .eq('id', expenseId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!existing) {
    return { success: false as const, error: 'Wydatek nie istnieje' };
  }

  const kpirChanged =
    updates.kpir_column !== undefined &&
    updates.kpir_column !== existing.kpir_column;
  const labelChanged =
    updates.category_label !== undefined &&
    updates.category_label !== existing.category_label;
  const categoryChanged = kpirChanged || labelChanged;

  const patch = buildExpenseUpdatePatch(updates, categoryChanged);

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
    } catch (err) {
      console.error('learnFromCorrection:', err);
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

  if (error) return { success: false as const, error: error.message };
  if (count === 0) {
    return { success: false as const, error: 'Wydatek nie istnieje' };
  }

  revalidatePath('/expenses');
  return { success: true as const };
}
