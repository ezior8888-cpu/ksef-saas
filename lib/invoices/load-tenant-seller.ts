import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import type { SellerData } from '@/types/invoice-types';

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

  const nip = String(raw.nip ?? '').replace(/\D/g, '');
  const addr = (raw.address_json as {
    countryCode?: string;
    addressLine1?: string;
    addressLine2?: string;
  } | null) ?? null;

  const line1 = (addr?.addressLine1 ?? '').trim() || '—';
  const line2 = (addr?.addressLine2 ?? '').trim() || '—';

  return {
    nip,
    name: String(raw.name ?? '').trim() || '—',
    address: {
      countryCode: (addr?.countryCode ?? 'PL').slice(0, 2).toUpperCase() || 'PL',
      addressLine1: line1,
      addressLine2: line2,
    },
  };
}
