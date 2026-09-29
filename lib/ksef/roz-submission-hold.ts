/** Temporary safety hold until ROZ advance links can be verified per KSeF environment. */
export const ROZ_SUBMISSION_HOLD_MESSAGE =
  'Wysyłka faktur rozliczających jest tymczasowo wstrzymana. Zapisz dokument jako szkic i spróbuj ponownie po przywróceniu wysyłki.';

export function isRozSubmission(input: {
  invoiceType?: string | null;
  storedInvoiceType?: string | null;
  invoiceKind?: string | null;
  auditKind?: string | null;
  finalData?: unknown;
  finalAdvanceSettlementRows?: unknown;
}): boolean {
  return input.invoiceType?.toUpperCase() === 'ROZ'
    || input.storedInvoiceType?.toUpperCase() === 'ROZ'
    || input.invoiceKind?.toLowerCase() === 'final'
    || input.auditKind?.toLowerCase() === 'final'
    || input.finalData != null
    || input.finalAdvanceSettlementRows != null;
}
