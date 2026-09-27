'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { normalizeExemptionBasis, readTenantVatExemption } from '@/lib/invoices/vat-exemption';
import { createAdminClient } from '@/lib/supabase/admin';
import { ActionAuthError, requireOrgRole } from '@/lib/supabase/auth-context';

export type VatExemptionResult =
  | { success: true; basis: string | null }
  | { success: false; error: string };

/**
 * Ustawia (albo zdejmuje — `null`/pusty tekst) zwolnienie z VAT firmy.
 *
 * Tylko właściciel i administrator: to zmienia treść każdej kolejnej faktury
 * wysyłanej do KSeF. Zapis przez klienta serwisowego PO sprawdzeniu roli
 * i aktywnego członkostwa (ten sam wzór co uzupełnianie NIP-u firmy).
 * Zmiana statusu podatkowego trafia do dziennika audytu.
 */
export async function updateVatExemptionAction(basisInput: string | null): Promise<VatExemptionResult> {
  let ctx;
  try {
    ctx = await requireOrgRole(['owner', 'admin']);
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }

  let basis: string | null;
  try {
    basis = normalizeExemptionBasis(basisInput);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Nieprawidłowa podstawa zwolnienia.' };
  }

  const admin = createAdminClient();
  const before = await readTenantVatExemption(admin, ctx.tenantId);

  const { error } = await admin
    .from('tenants')
    .update({ vat_exemption_basis: basis })
    .eq('id', ctx.tenantId);

  if (error) {
    return {
      success: false,
      error:
        error.code === '42703'
          ? 'Ta funkcja czeka jeszcze na aktualizację bazy danych. Spróbuj ponownie później.'
          : 'Nie udało się zapisać ustawienia VAT.',
    };
  }

  await logAudit({
    action: 'tenant.updated',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    entityType: 'tenant',
    entityId: ctx.tenantId,
    metadata: { field: 'vat_exemption_basis', from: before, to: basis },
  });

  revalidatePath('/settings');
  revalidatePath('/invoices/new/regular');
  return { success: true, basis };
}
