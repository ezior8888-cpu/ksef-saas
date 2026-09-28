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

import type { AdvanceInvoiceSettlementRow } from '@/lib/ksef/fa3-advance-generator';
import { roundToCents } from '@/lib/xml/invoice-calculator';

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
