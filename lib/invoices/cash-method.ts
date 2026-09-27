/**
 * Metoda kasowa VAT firmy (art. 21 ustawy o VAT) — `tenants.vat_cash_method`
 * (migracja 00094). Na fakturach: P_16 = 1 w FA(3) i wyrazy „metoda kasowa”
 * (art. 106e ust. 1 pkt 16).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Kod PostgREST/Postgres „nie ma takiej kolumny” — przed wgraniem 00094. */
const UNDEFINED_COLUMN = '42703';

/**
 * Odczyt odporny na kolejność wdrożenia: przed migracją brak kolumny znaczy
 * „metoda memoriałowa”, a nie wywrócona strona. Każdy inny błąd — rzuca.
 */
export async function readTenantCashMethod(
  client: SupabaseClient,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('tenants')
    .select('vat_cash_method')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    if (error.code === UNDEFINED_COLUMN) return false;
    throw new Error(`Nie można odczytać metody rozliczania VAT firmy: ${error.message}`);
  }
  return (data as { vat_cash_method?: unknown } | null)?.vat_cash_method === true;
}
