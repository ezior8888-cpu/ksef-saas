/**
 * Czy JPK_FA za okres w ogóle powstanie — sprawdzane PRZED utworzeniem
 * eksportów paczki Co-Pilot. Jeden nieudany format wywraca całą paczkę
 * dla księgowej (`co-pilot-monthly.ts`), więc zamiast pliku, który odmówi,
 * paczka dostaje uniwersalny CSV (jak przy braku urzędu, #67).
 *
 * JPK_FA odmawia, gdy (`jpk-fa-generator.ts`):
 * - w okresie jest faktura korygująca (kwoty korekty w bazie — C-01),
 * - GUS nie zna adresu firmy z województwem, powiatem i gminą.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { MissingIssuerAddressError, readIssuerRegisteredAddress } from '@/lib/exports/issuer-address';
import { JpkFaCorrectionNotSupportedError } from '@/lib/exports/jpk-fa-generator';

/** Powód, dla którego JPK_FA nie powstanie, albo `null`. */
export async function jpkFaBlocker(
  client: SupabaseClient,
  params: {
    tenantId: string;
    periodStart: string;
    periodEnd: string;
    /** Ustawienie paczki — bez korekt eksport ich nie czyta, więc nie blokują. */
    includeCorrections: boolean;
  },
): Promise<string | null> {
  if (params.includeCorrections) {
    const { count, error } = await client
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', params.tenantId)
      .eq('direction', 'outgoing')
      .eq('ksef_status', 'accepted')
      .eq('invoice_kind', 'correction')
      .gte('issue_date', params.periodStart)
      .lte('issue_date', params.periodEnd);
    if (error) throw new Error(`Nie można sprawdzić korekt okresu: ${error.message}`);
    if ((count ?? 0) > 0) return new JpkFaCorrectionNotSupportedError().message;
  }

  const { data: tenant, error: tenantError } = await client
    .from('tenants')
    .select('nip')
    .eq('id', params.tenantId)
    .maybeSingle();
  if (tenantError) throw new Error(`Nie można odczytać NIP-u firmy: ${tenantError.message}`);
  const nip = (tenant as { nip?: string | null } | null)?.nip?.trim();
  if (!nip) return new MissingIssuerAddressError().message;

  try {
    const address = await readIssuerRegisteredAddress(nip);
    return address ? null : new MissingIssuerAddressError().message;
  } catch {
    // GUS chwilowo nie odpowiada — paczka i tak ma pójść, z CSV zamiast JPK_FA.
    return new MissingIssuerAddressError().message;
  }
}
