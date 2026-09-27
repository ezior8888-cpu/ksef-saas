/** Offline24 persists only an invoice id, so replay is safe only for ordinary FA(3). */
export function isOfflineReplayableInvoice(invoice: {
  invoice_kind: unknown;
  invoice_type: unknown;
  fa3_data: unknown;
}): boolean {
  const fa3 = invoice.fa3_data;
  const fa3Type = fa3 && typeof fa3 === 'object' && !Array.isArray(fa3)
    ? (fa3 as Record<string, unknown>).type
    : null;
  return invoice.invoice_kind === 'regular' &&
    (invoice.invoice_type === 'VAT' || invoice.invoice_type === 'UPR') &&
    fa3Type === invoice.invoice_type;
}
