'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { normalizeTaxOfficeCode, readTenantTaxOffice } from '@/lib/exports/tax-office';
import { createAdminClient } from '@/lib/supabase/admin';
import { ActionAuthError, requireOrgRole } from '@/lib/supabase/auth-context';

export type TaxOfficeResult =
  | { success: true; code: string | null }
  | { success: false; error: string };

/**
 * Ustawia (albo zdejmuje — `null`/pusty tekst) urząd skarbowy firmy.
 *
 * Tylko właściciel i administrator: urząd trafia do nagłówka plików JPK
 * składanych w imieniu firmy. Zapis przez klienta serwisowego PO sprawdzeniu
 * roli i aktywnego członkostwa (ten sam wzór co zwolnienie z VAT).
 * Zmiana trafia do dziennika audytu.
 */
export async function updateTaxOfficeAction(input: string | null): Promise<TaxOfficeResult> {
  let ctx;
  try {
    ctx = await requireOrgRole(['owner', 'admin']);
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }

  let code: string | null;
  try {
    code = normalizeTaxOfficeCode(input);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Nieprawidłowy urząd skarbowy.' };
  }

  const admin = createAdminClient();
  const before = await readTenantTaxOffice(admin, ctx.tenantId);

  const { error } = await admin
    .from('tenants')
    .update({ tax_office_code: code })
    .eq('id', ctx.tenantId);

  if (error) {
    return {
      success: false,
      error:
        error.code === '42703'
          ? 'Ta funkcja czeka jeszcze na aktualizację bazy danych. Spróbuj ponownie później.'
          : 'Nie udało się zapisać urzędu skarbowego.',
    };
  }

  await logAudit({
    action: 'tenant.updated',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    entityType: 'tenant',
    entityId: ctx.tenantId,
    metadata: { field: 'tax_office_code', from: before, to: code },
  });

  revalidatePath('/settings/accountant');
  revalidatePath('/reports/exports');
  return { success: true, code };
}
