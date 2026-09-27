'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { readTenantCashMethod } from '@/lib/invoices/cash-method';
import { createAdminClient } from '@/lib/supabase/admin';
import { ActionAuthError, requireOrgRole } from '@/lib/supabase/auth-context';

export type CashMethodResult =
  | { success: true; enabled: boolean }
  | { success: false; error: string };

/**
 * Włącza albo wyłącza metodę kasową VAT firmy.
 *
 * Tylko właściciel i administrator: to zmienia treść każdej kolejnej faktury
 * (P_16 w FA(3)). Zapis przez klienta serwisowego PO sprawdzeniu roli
 * i aktywnego członkostwa (ten sam wzór co zwolnienie z VAT). Zmiana trafia
 * do dziennika audytu.
 */
export async function updateCashMethodAction(enabled: boolean): Promise<CashMethodResult> {
  let ctx;
  try {
    ctx = await requireOrgRole(['owner', 'admin']);
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }

  if (typeof enabled !== 'boolean') {
    return { success: false, error: 'Nieprawidłowe ustawienie metody kasowej.' };
  }

  const admin = createAdminClient();
  const before = await readTenantCashMethod(admin, ctx.tenantId);

  const { error } = await admin
    .from('tenants')
    .update({ vat_cash_method: enabled })
    .eq('id', ctx.tenantId);

  if (error) {
    return {
      success: false,
      error:
        error.code === '42703'
          ? 'Ta funkcja czeka jeszcze na aktualizację bazy danych. Spróbuj ponownie później.'
          : 'Nie udało się zapisać metody rozliczania VAT.',
    };
  }

  await logAudit({
    action: 'tenant.updated',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    entityType: 'tenant',
    entityId: ctx.tenantId,
    metadata: { field: 'vat_cash_method', from: before, to: enabled },
  });

  revalidatePath('/settings');
  return { success: true, enabled };
}
