'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { logAudit } from '@/lib/audit/log';
import { createClient } from '@/lib/supabase/server';

export type RequestAccountDeletionResult =
  | { success: false; error: string }
  | { success: true };

function normalizeNip(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 10);
}

/**
 * Soft-delete tenanta (30 dni do hard delete).
 * Tylko owner; wymaga wpisania NIP firmy w formularzu.
 */
export async function requestAccountDeletionAction(
  formData: FormData
): Promise<RequestAccountDeletionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Brak sesji' };

  const nipConfirm = normalizeNip(String(formData.get('nipConfirm') ?? ''));
  if (nipConfirm.length !== 10) {
    return { success: false, error: 'Podaj poprawny 10-cyfrowy NIP.' };
  }

  const { data: userData, error: userErr } = await supabase
    .from('users')
    .select('tenant_id, role, tenants(nip)')
    .eq('id', user.id)
    .single();

  if (userErr || !userData?.tenant_id) {
    return { success: false, error: 'Nie znaleziono firmy przypisanej do konta.' };
  }

  if (userData.role !== 'owner') {
    return {
      success: false,
      error: 'Tylko właściciel konta może zlecić usunięcie firmy.',
    };
  }

  const tenantRow = Array.isArray(userData.tenants)
    ? userData.tenants[0]
    : userData.tenants;
  const tenantNip = normalizeNip(String(tenantRow?.nip ?? ''));
  if (tenantNip !== nipConfirm) {
    return {
      success: false,
      error: 'NIP nie zgadza się z firmą na tym koncie.',
    };
  }

  const now = new Date();
  const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const tenantId = userData.tenant_id;

  const { error: updErr } = await supabase
    .from('tenants')
    .update({
      deleted_at: now.toISOString(),
      hard_delete_at: in30days.toISOString(),
      is_active: false,
    })
    .eq('id', tenantId);

  if (updErr) {
    return {
      success: false,
      error: `Nie udało się zapisać żądania usunięcia: ${updErr.message}`,
    };
  }

  await logAudit({
    action: 'retention.deletion_requested',
    tenantId,
    userId: user.id,
    metadata: { hardDeleteAt: in30days.toISOString() },
  });

  revalidatePath('/', 'layout');
  await supabase.auth.signOut();
  redirect('/login?success=account_deleted');
}
