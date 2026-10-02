/**
 * Kwoty faktur sprzedaży w raportach PLN nie mają tutaj kursu ani osobnych
 * wartości podatkowych w PLN. Brak waluty także nie potwierdza złotówek.
 */
export class OutgoingInvoiceCurrencyNotSupportedError extends Error {
  constructor() {
    super(
      'Raport wstrzymany: faktura sprzedaży nie ma potwierdzonej waluty PLN. ' +
        'Faktury walutowe wymagają uzgodnienia z księgową.',
    );
    this.name = 'OutgoingInvoiceCurrencyNotSupportedError';
  }
}

export function assertOutgoingInvoicesInPln(
  invoices: readonly { currency?: string | null }[],
): void {
  if (invoices.some((invoice) => invoice.currency?.trim().toUpperCase() !== 'PLN')) {
    throw new OutgoingInvoiceCurrencyNotSupportedError();
  }
}
