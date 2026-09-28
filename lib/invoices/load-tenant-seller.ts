import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import type { SellerData } from '@/types/invoice-types';
import { sellerFromTenantProfile } from '@/lib/invoices/tenant-seller';

/**
 * Dane sprzedawcy z profilu aktywnej organizacji dla formularzy FA
 * (zaliczka / rozliczenie / korekta). Jeśli user nie ma aktywnej org —
 * zwracamy null (caller pokaże fallback).
 *
 * Membership weryfikujemy przez admin client (deterministycznie); odczyt
 * tenant info także admin (po weryfikacji nie ma już potrzeby polegać na RLS).
 */
export async function loadTenantSellerForForms(): Promise<SellerData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) return null;

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('organization_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return null;

  const { data: raw, error } = await admin
    .from('tenants')
    .select('id, nip, name, address_json')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !raw) return null;

  return sellerFromTenantProfile(raw);
}
