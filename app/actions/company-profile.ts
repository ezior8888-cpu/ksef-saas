'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { companyProfileSchema, type CompanyProfileInput } from '@/lib/schemas/company-profile';
import { createAdminClient } from '@/lib/supabase/admin';
import { ActionAuthError, requireOrgRole } from '@/lib/supabase/auth-context';

export type CompanyProfileResult = { success: true } | { success: false; error: string };

/**
 * Zmiana nazwy i adresu siedziby firmy (F-008). Do 02.10.2026 dane były tylko
 * do odczytu: błędny albo nieaktualny adres z GUS trafiał na każdą fakturę.
 *
 * Tylko właściciel i administrator — zmienia to treść każdej kolejnej faktury
 * (Podmiot1) i JPK. Zapis klientem serwisowym PO sprawdzeniu roli i aktywnego
 * członkostwa (ten sam wzór co ustawienie zwolnienia z VAT). NIP pozostaje bez
 * zmian. Wystawione faktury mają własną kopię danych sprzedawcy, więc zmiana
 * ich nie dotyka.
 */
export async function updateCompanyProfileAction(input: CompanyProfileInput): Promise<CompanyProfileResult> {
  let ctx;
  try {
    ctx = await requireOrgRole(['owner', 'admin']);
  } catch (e) {
    if (e instanceof ActionAuthError) return { success: false, error: e.message };
    throw e;
  }

  const parsed = companyProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane firmy.' };
  }
  const { name, addressLine1, addressLine2 } = parsed.data;

  const admin = createAdminClient();
  const { data: before } = await admin
    .from('tenants')
    .select('name, address_json')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const { error } = await admin
    .from('tenants')
    .update({
      name,
      address_json: { countryCode: 'PL', addressLine1, addressLine2 },
    })
    .eq('id', ctx.tenantId);

  if (error) {
    return { success: false, error: 'Nie udało się zapisać danych firmy.' };
  }

  await logAudit({
    action: 'tenant.updated',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    entityType: 'tenant',
    entityId: ctx.tenantId,
    metadata: {
      field: 'company_profile',
      before: before ? { name: before.name, address: before.address_json } : null,
      after: { name, address: { addressLine1, addressLine2 } },
    },
  });

  revalidatePath('/settings');
  return { success: true };
}
