'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  importFileUploaded,
  importKsefHistoryRequested,
  inngest,
} from '@/lib/inngest/client';
import { formatInngestSendError } from '@/lib/inngest/error-message';
import { uploadImportFile } from '@/lib/import/file-storage';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// Magiczny Import z KSeF
// ============================================================================

export type MagicImportSecondArg =
  | number
  | {
      monthsBack?: number;
      dateFrom?: string;
      dateTo?: string;
      direction?: 'issued' | 'received';
    };

export type MagicImportResult =
  | { success: true; importJobId: string }
  | { success: false; error: string };

/**
 * Uruchamia import historii z KSeF (event `import/ksef-history.requested`).
 * Drugi argument: liczba miesięcy wstecz (domyślnie 6, heurystyka ~30 dni/mies.)
 * lub obiekt z zakresem dat i kierunkiem.
 */
export async function startMagicImportAction(
  tenantId: string,
  arg: MagicImportSecondArg = 6,
): Promise<MagicImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const { getActiveOrgIdFromCookies } = await import(
    '@/lib/supabase/active-org'
  );
  const activeOrg = await getActiveOrgIdFromCookies();
  if (activeOrg !== tenantId) {
    return { success: false, error: 'Brak uprawnień' };
  }

  const isNum = typeof arg === 'number';
  const opts = isNum ? undefined : arg;
  const monthsBack = isNum ? arg : opts?.monthsBack ?? 6;

  const dateTo =
    opts?.dateTo && opts.dateTo.length >= 10
      ? opts.dateTo.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const dateFrom =
    opts?.dateFrom && opts.dateFrom.length >= 10
      ? opts.dateFrom.slice(0, 10)
      : new Date(Date.now() - monthsBack * 30 * 86400000).toISOString().slice(0, 10);
  const direction = opts?.direction ?? 'issued';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return { success: false, error: 'Niepoprawny format dat (YYYY-MM-DD).' };
  }

  // NIP potrzebny do klucza concurrency w `magicImportKsefJob`
  // (`{ key: 'event.data.nip', limit: 3 }`) — limit per-tenant.
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('nip')
    .eq('id', tenantId)
    .single();

  if (tenantErr || !tenantRow?.nip) {
    return {
      success: false,
      error: tenantErr?.message ?? 'Brak NIP tenanta',
    };
  }

  const { data: job, error } = await supabase
    .from('import_jobs')
    .insert({
      tenant_id: tenantId,
      triggered_by: user.id,
      source: 'ksef_history',
      direction,
      date_from: dateFrom,
      date_to: dateTo,
      status: 'pending',
      progress_message: 'Inicjalizacja...',
    })
    .select('id')
    .single();

  if (error || !job) {
    return { success: false, error: error?.message ?? 'Błąd tworzenia jobu' };
  }

  try {
    await inngest.send(
      importKsefHistoryRequested.create({
        importJobId: job.id,
        tenantId,
        nip: tenantRow.nip,
        dateFrom,
        dateTo,
        direction,
      }),
    );
  } catch (e) {
    const friendly = formatInngestSendError(e);
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        progress_percent: 100,
        progress_message: friendly.slice(0, 900),
      })
      .eq('id', job.id);
    return { success: false, error: friendly };
  }

  revalidatePath('/onboarding/import-source');
  revalidatePath(`/onboarding/progress/${job.id}`);

  return { success: true, importJobId: job.id };
}

/**
 * "Pomiń — zacznę od zera": atomowe server-side redirect na Dashboard (`/dashboard`).
 * Eliminuje race-condition window.location.assign — kolejny request idzie
 * z poprawnymi cookies (auth + ksef.active_org).
 *
 * `?welcome=1` triggeruje WelcomeModal w `app/(dashboard)/dashboard/page.tsx`
 * z trzema ścieżkami startowymi (Faza 19).
 */
export async function skipMagicImportAction(): Promise<void> {
  redirect('/dashboard?welcome=1');
}

// ============================================================================
// Import z pliku (JPK_FA, CSV)
// ============================================================================

export type FileImportSource =
  | 'jpk_fa'
  | 'fakturownia_csv'
  | 'infakt_csv'
  | 'wfirma_csv'
  | 'ifirma_csv';

export type FileImportActionResult =
  | { success: true; importJobId: string }
  | { success: false; error: string };

const FILE_SOURCES: FileImportSource[] = [
  'jpk_fa',
  'fakturownia_csv',
  'infakt_csv',
  'wfirma_csv',
  'ifirma_csv',
];

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function startFileImportAction(
  formData: FormData,
): Promise<FileImportActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Niezalogowany' };

  const file = formData.get('file');
  const sourceRaw = formData.get('source');
  const tenantIdRaw = formData.get('tenantId');

  if (!(file instanceof File) || !sourceRaw || !tenantIdRaw) {
    return { success: false, error: 'Brakujące dane' };
  }

  const source =
    typeof sourceRaw === 'string' ? sourceRaw.trim() : String(sourceRaw);
  const tenantId =
    typeof tenantIdRaw === 'string' ? tenantIdRaw.trim() : String(tenantIdRaw);

  if (!FILE_SOURCES.includes(source as FileImportSource)) {
    return { success: false, error: 'Nieobsługiwane źródło pliku.' };
  }

  if (file.size === 0) {
    return { success: false, error: 'Plik jest pusty.' };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { success: false, error: 'Plik za duży (max 10 MB)' };
  }

  const { getActiveOrgIdFromCookies } = await import(
    '@/lib/supabase/active-org'
  );
  const activeOrg = await getActiveOrgIdFromCookies();
  if (activeOrg !== tenantId) {
    return { success: false, error: 'Brak uprawnień' };
  }

  const sourceTyped = source as FileImportSource;

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .insert({
      tenant_id: tenantId,
      triggered_by: user.id,
      source: sourceTyped,
      status: 'pending',
      source_filename: file.name,
      source_file_size: file.size,
      progress_message: 'Wgrywanie pliku...',
    })
    .select('id')
    .single();

  if (jobError || !job) {
    return { success: false, error: jobError?.message ?? 'Błąd tworzenia jobu' };
  }

  let filePath: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    filePath = await uploadImportFile(
      tenantId,
      job.id,
      file.name,
      buffer,
      file.type?.trim() || 'application/octet-stream',
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Błąd zapisu pliku.';
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        progress_percent: 100,
        progress_message: msg.slice(0, 900),
      })
      .eq('id', job.id);
    return { success: false, error: msg };
  }

  const { error: pathErr } = await supabase
    .from('import_jobs')
    .update({ source_file_path: filePath })
    .eq('id', job.id);

  if (pathErr) {
    const msg = pathErr.message;
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        progress_percent: 100,
        progress_message: msg.slice(0, 900),
      })
      .eq('id', job.id);
    return { success: false, error: msg };
  }

  try {
    await inngest.send(
      importFileUploaded.create({
        importJobId: job.id,
        tenantId,
        filePath,
        source: sourceTyped,
      }),
    );
  } catch (e) {
    const friendly = formatInngestSendError(e);
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        progress_percent: 100,
        progress_message: friendly.slice(0, 900),
      })
      .eq('id', job.id);
    return { success: false, error: friendly };
  }

  revalidatePath('/onboarding/import-source');
  revalidatePath(`/onboarding/progress/${job.id}`);

  return { success: true, importJobId: job.id };
}
