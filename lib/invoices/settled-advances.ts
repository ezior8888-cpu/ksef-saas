/**
 * Zaliczki rozliczone fakturą ROZ — ile z jej wartości KPiR już policzył.
 *
 * Reguła przychodu: `lib/categorization/kpir-revenue.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Tyle identyfikatorów na jedno `.in()` — długość adresu zapytania PostgREST. */
const LOOKUP_CHUNK = 100;

export interface SettlementSource {
  id: string;
  invoice_kind?: string | null;
  advance_invoice_ids?: string[] | null;
}

/**
 * Suma netto zaliczek rozliczonych każdą fakturą ROZ z listy. Klucz: id ROZ.
 *
 * Liczą się tylko zaliczki, które KPiR bierze jako przychód — wystawione,
 * tej firmy, przyjęte przez KSeF. Zaliczka odrzucona albo robocza w KPiR
 * nie jest, więc nie ma czego odejmować; cudzy identyfikator w tablicy
 * (dane zapisywalne) też nic nie odejmie.
 *
 * Błąd odczytu rzuca: „nie wiem, ile było zaliczek” to nie „zero zaliczek” —
 * inaczej KPiR po cichu wróciłby do dubla.
 */
export async function fetchSettledAdvancesNet(
  client: SupabaseClient,
  tenantId: string,
  invoices: ReadonlyArray<SettlementSource>,
): Promise<Map<string, number>> {
  const finals = invoices.filter(
    (inv) => inv.invoice_kind === 'final' && (inv.advance_invoice_ids?.length ?? 0) > 0,
  );
  const result = new Map<string, number>();
  if (finals.length === 0) return result;

  const ids = [...new Set(finals.flatMap((inv) => inv.advance_invoice_ids ?? []))];
  const netById = new Map<string, number>();
  for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
    const { data, error } = await client
      .from('invoices')
      .select('id, net_total')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outgoing')
      .eq('invoice_kind', 'advance')
      .eq('ksef_status', 'accepted')
      .in('id', ids.slice(i, i + LOOKUP_CHUNK));
    if (error) throw new Error(`Nie można odczytać zaliczek rozliczonych fakturą końcową: ${error.message}`);
    for (const row of (data ?? []) as Array<{ id: string; net_total: number | string | null }>) {
      netById.set(row.id, Number(row.net_total ?? 0));
    }
  }

  for (const inv of finals) {
    let sum = 0;
    for (const id of new Set(inv.advance_invoice_ids ?? [])) sum += netById.get(id) ?? 0;
    result.set(inv.id, Math.round(sum * 100) / 100);
  }
  return result;
}
