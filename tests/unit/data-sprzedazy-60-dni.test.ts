import { describe, expect, it } from 'vitest';

import { invoiceFormSchema, type InvoiceFormValues } from '@/lib/schemas/invoice-form';
import { finalizeInvoice, validateInvoice } from '@/lib/xml/invoice-calculator';

/**
 * F-014 (audyt bloku 1): formularz i walidacja przy wysyłce zabraniały daty
 * sprzedaży późniejszej niż data wystawienia. Art. 106i ust. 7 ustawy o VAT
 * pozwala wystawić fakturę najwcześniej 60. dnia przed dostawą lub usługą,
 * więc data sprzedaży może być do 60 dni po dacie wystawienia.
 */

const ISSUE = '2026-10-02';

const form = (saleDate: string): InvoiceFormValues => ({
  internalNumber: 'FV/1/10/2026', issueDate: ISSUE, saleDate,
  buyerNip: '5252241585', buyerName: 'Klient', buyerAddressLine1: 'ul. B 2',
  buyerAddressLine2: '00-002 Warszawa', buyerEmail: '', buyerIsConsumer: false,
  buyerPesel: '', buyerIdDocument: '', paymentMethod: 'transfer', paymentDueDate: '2026-10-16',
  bankAccount: 'PL61109010140000071219812874',
  lines: [{ name: 'Usługa', unit: 'szt', quantity: 1, unitPriceNet: 100, vatRate: '23' }],
});

const invoice = (saleDate: string) =>
  finalizeInvoice({
    internalNumber: 'FV/1/10/2026',
    type: 'VAT',
    issueDate: ISSUE,
    saleDate,
    seller: { nip: '5260001246', name: 'Moja Firma', address: { countryCode: 'PL', addressLine1: 'ul. A 1', addressLine2: '00-001 Warszawa' } },
    buyer: { nip: '5252241585', name: 'Klient', address: { countryCode: 'PL', addressLine1: 'ul. B 2', addressLine2: '00-002 Warszawa' } },
    lines: [{ ordinal: 1, name: 'Usługa', unit: 'szt', quantity: 1, unitPriceNet: 100, vatRate: '23' }],
    payment: { currency: 'PLN', dueDate: '2026-10-16', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
  });

const NOW = new Date(`${ISSUE}T10:00:00Z`);

describe('data sprzedaży a data wystawienia (F-014)', () => {
  it.each([
    ['wcześniejsza', '2026-09-30'],
    ['ta sama', ISSUE],
    ['10 dni później', '2026-10-12'],
    ['dokładnie 60 dni później', '2026-12-01'],
  ])('%s — dozwolona', (_label, sale) => {
    expect(invoiceFormSchema.safeParse(form(sale)).success).toBe(true);
    expect(validateInvoice(invoice(sale), NOW)).toEqual([]);
  });

  it('61 dni później — odrzucona z powołaniem na art. 106i ust. 7', () => {
    const parsed = invoiceFormSchema.safeParse(form('2026-12-02'));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]!.message).toContain('60 dni');
    expect(validateInvoice(invoice('2026-12-02'), NOW).join(' ')).toContain('60 dni');
  });
});
