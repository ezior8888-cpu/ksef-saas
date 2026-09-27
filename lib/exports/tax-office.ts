/**
 * Urząd skarbowy firmy — `KodUrzedu` w plikach JPK.
 *
 * Do 27.09 JPK_FA wpisywał każdemu klientowi kod 1408 (według słownika MF:
 * Urząd Skarbowy w Kozienicach), bo aplikacja nie znała urzędu klienta.
 * Kolumna `tenants.tax_office_code` (migracja 00092): NULL = nie ustawiono.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { isKnownTaxOffice } from '@/lib/exports/tax-offices';

/**
 * Wybór z listy: „1433 — URZĄD…” albo sam „1433” → „1433”; pusty → `null`
 * (zdjęcie ustawienia). Kod spoza słownika MF — błąd: plik JPK z nieznanym
 * urzędem i tak odrzuci bramka.
 */
export function normalizeTaxOfficeCode(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const code = /^(\d{4})(?!\d)/.exec(raw)?.[1];
  if (!code || !isKnownTaxOffice(code)) {
    throw new Error('Nie znam takiego urzędu skarbowego — wybierz go z listy.');
  }
  return code;
}

/** Kod PostgREST/Postgres „nie ma takiej kolumny” — przed wgraniem 00092. */
const UNDEFINED_COLUMN = '42703';

/**
 * Odczyt odporny na kolejność wdrożenia: przed migracją brak kolumny znaczy
 * „nie ustawiono”, a nie wywrócona strona. Każdy inny błąd — rzuca.
 */
export async function readTenantTaxOffice(
  client: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('tenants')
    .select('tax_office_code')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    if (error.code === UNDEFINED_COLUMN) return null;
    throw new Error(`Nie można odczytać urzędu skarbowego firmy: ${error.message}`);
  }
  const raw = (data as { tax_office_code?: unknown } | null)?.tax_office_code;
  return typeof raw === 'string' && isKnownTaxOffice(raw) ? raw : null;
}
