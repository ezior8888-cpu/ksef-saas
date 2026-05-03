import { createClient } from '@/lib/supabase/server';
import type { SellerData } from '@/types/invoice-types';

/**
 * Dane sprzedawcy z profilu tenanta dla formularzy FA (zaliczka / rozliczenie / korekta).
 */
export async function loadTenantSellerForForms(): Promise<SellerData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userData, error } = await supabase
    .from('users')
    .select('tenant_id, tenants(id, nip, name, address_json)')
    .eq('id', user.id)
    .single();

  if (error || !userData?.tenant_id) return null;

  const raw = Array.isArray(userData.tenants) ? userData.tenants[0] : userData.tenants;
  if (!raw) return null;

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
