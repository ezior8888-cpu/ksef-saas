/**
 * Wiersz zaliczki do faktury rozliczającej (ROZ) — z wiersza `invoices`
 * faktury zaliczkowej.
 *
 * Poza kwotą brutto niesie stawkę i rozbicie netto/VAT: ROZ pomniejsza
 * o nie P_13_x/P_14_x w stawce zaliczki (`settlementVatSummaries`,
 * art. 106f ust. 3). Faktura zaliczkowa ma jedną pozycję
 * (`fa3-advance-generator.ts`: `advanceLineItem`), więc stawka to stawka
 * tej pozycji w `fa3_data`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AdvanceInvoiceSettlementRow } from '@/lib/ksef/fa3-advance-generator';
import { roundToCents } from '@/lib/xml/invoice-calculator';

/** Tyle identyfikatorów na jedno `.in()` — długość adresu zapytania PostgREST. */
const LOOKUP_CHUNK = 100;

export interface AdvanceInvoiceDbRow {
  id: string;
  internal_number: string | null;
  ksef_number: string | null;
  issue_date: string;
  advance_amount: number | string | null;
  gross_total: number | string | null;
  net_total: number | string | null;
  vat_total: number | string | null;
  fa3_data: unknown;
}

/** Stawka jedynej pozycji faktury zaliczkowej; `null`, gdy nie da się jej ustalić. */
export function advanceVatRate(fa3Data: unknown): string | null {
  if (!fa3Data || typeof fa3Data !== 'object') return null;
  const lines = (fa3Data as { lines?: unknown }).lines;
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const rates = new Set(
    lines.map((l) => (l && typeof l === 'object' ? (l as { vatRate?: unknown }).vatRate : undefined)),
  );
  // Więcej niż jedna stawka to nie jest nasza faktura zaliczkowa — nie zgadujemy.
  if (rates.size !== 1) return null;
  const [rate] = [...rates];
  return typeof rate === 'string' && rate.trim() ? rate.trim() : null;
}

export function settlementRowFromAdvance(row: AdvanceInvoiceDbRow): AdvanceInvoiceSettlementRow {
  const gross = roundToCents(Number(row.advance_amount ?? row.gross_total ?? 0));
  const net = row.net_total == null ? null : roundToCents(Number(row.net_total));
  const vat = row.vat_total == null ? null : roundToCents(Number(row.vat_total));
  // Rozbicie z bazy tylko wtedy, gdy się sumuje do kwoty zaliczki — inaczej
  // generator policzy je sam ze stawki (ten sam wzór co faktura zaliczkowa).
  const consistent = net != null && vat != null && roundToCents(net + vat) === gross;
  return {
    internal_number: row.internal_number ?? row.id.slice(0, 13),
    ksef_number: row.ksef_number,
    advance_amount: gross,
    issue_date: row.issue_date,
    vat_rate: advanceVatRate(row.fa3_data),
    net_amount: consistent ? net : null,
    vat_amount: consistent ? vat : null,
  };
}

/**
 * Wiersze zaliczek dla każdej faktury ROZ z listy (klucz: id ROZ), w kolejności
 * z `advance_invoice_ids`. Te same zaliczki, które liczy KPiR
 * (`fetchSettledAdvancesNet`): tej firmy, wystawione, przyjęte przez KSeF —
 * cudzy albo nieprzyjęty identyfikator nic nie odejmie.
 *
 * Błąd odczytu rzuca: plik z „zerem zaliczek” miałby zawyżone P_13/P_14/P_15.
 */
export async function fetchAdvanceSettlementRows(
  client: SupabaseClient,
  tenantId: string,
  invoices: ReadonlyArray<{ id: string; invoice_kind?: string | null; advance_invoice_ids?: string[] | null }>,
): Promise<Map<string, AdvanceInvoiceSettlementRow[]>> {
  const finals = invoices.filter(
    (inv) => inv.invoice_kind === 'final' && (inv.advance_invoice_ids?.length ?? 0) > 0,
  );
  const result = new Map<string, AdvanceInvoiceSettlementRow[]>();
  if (finals.length === 0) return result;

  const ids = [...new Set(finals.flatMap((inv) => inv.advance_invoice_ids ?? []))];
  const byId = new Map<string, AdvanceInvoiceSettlementRow>();
  for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
    const { data, error } = await client
      .from('invoices')
      .select('id, internal_number, ksef_number, issue_date, advance_amount, gross_total, net_total, vat_total, fa3_data')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outgoing')
      .eq('invoice_kind', 'advance')
      .eq('ksef_status', 'accepted')
      .in('id', ids.slice(i, i + LOOKUP_CHUNK));
    if (error) throw new Error(`Nie można odczytać zaliczek rozliczonych fakturą końcową: ${error.message}`);
    for (const row of (data ?? []) as AdvanceInvoiceDbRow[]) byId.set(row.id, settlementRowFromAdvance(row));
  }

  for (const inv of finals) {
    const rows = [...new Set(inv.advance_invoice_ids ?? [])]
      .map((id) => byId.get(id))
      .filter((row): row is AdvanceInvoiceSettlementRow => row !== undefined);
    result.set(inv.id, rows);
  }
  return result;
}
