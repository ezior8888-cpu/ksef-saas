import { describe, expect, it } from 'vitest';

import { generateFA3Xml } from '@/lib/xml/fa3-generator';
import {
  finalizeInvoice,
  issueDateRangeErrors,
  normalizeIban,
  validateIban,
  validateInvoice,
  type InvoiceInput,
} from '@/lib/xml/invoice-calculator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import { invoiceFormSchema, type InvoiceFormValues } from '@/lib/schemas/invoice-form';

/**
 * Do 01.10.2026 walidacja faktury (`validateInvoice`, przy wysyłce do KSeF)
 * wymagała IBAN z „PL”, a formularz przyjmował cokolwiek — zwykły numer
 * rachunku (26 cyfr, tak podpowiada pole) przechodził zapis, a job oznaczał
 * fakturę jako nieudaną, bez możliwości poprawki (ponowna wysyłka wstrzymana).
 * To samo z przelewem bez rachunku i datą wystawienia spoza zakresu.
 */

const NRB = '61109010140000071219812874';

function faktura(o: Partial<InvoiceInput> = {}) {
  return finalizeInvoice({
    internalNumber: 'FV 1/10/2026',
    type: 'VAT',
    issueDate: '2026-10-01',
    saleDate: '2026-10-01',
    seller: {
      nip: '5260001246',
      name: 'Jan Kowalski Usługi',
      address: { countryCode: 'PL', addressLine1: 'ul. Przykładowa 1', addressLine2: '00-001 Warszawa' },
    },
    buyer: {
      nip: '5252241585',
      name: 'Klient Sp. z o.o.',
      address: { countryCode: 'PL', addressLine1: 'ul. Klienta 10', addressLine2: '02-001 Warszawa' },
    },
    lines: [{ ordinal: 1, name: 'Usługa', unit: 'godz.', quantity: 10, unitPriceNet: 150, vatRate: '23' }],
    payment: { currency: 'PLN', dueDate: '2026-10-15', method: 'transfer', bankAccount: NRB },
    ...o,
  });
}

const formularz = (o: Partial<InvoiceFormValues> = {}): InvoiceFormValues => ({
  internalNumber: 'FV/1', issueDate: new Date().toISOString().slice(0, 10), saleDate: '',
  buyerNip: '5252241585', buyerName: 'Klient', buyerAddressLine1: 'ul. Klienta 10', buyerAddressLine2: '02-001 Warszawa',
  buyerEmail: '', buyerIsConsumer: false, buyerPesel: '', buyerIdDocument: '',
  lines: [{ name: 'Usługa', unit: 'szt', quantity: 1, unitPriceNet: 100, vatRate: '23' }],
  paymentMethod: 'transfer', paymentDueDate: '2099-12-31', bankAccount: NRB,
  ...o,
});
const bledy = (v: InvoiceFormValues) => {
  const r = invoiceFormSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('numer rachunku', () => {
  it.each([NRB, '61 1090 1014 0000 0712 1981 2874', '61-1090-1014-0000-0712-1981-2874', `PL${NRB}`, `pl ${NRB}`])(
    '%s — poprawny',
    (v) => expect(validateIban(v)).toBe(true),
  );

  it.each(['61109010140000071219812875', '6110901014000007121981287', 'DE00123', ''])('%s — odrzucony', (v) => {
    expect(validateIban(v)).toBe(false);
  });

  it('normalizacja: 26 cyfr dostaje PL, IBAN innego kraju zostaje', () => {
    expect(normalizeIban('61 1090-1014 0000 0712 1981 2874')).toBe(`PL${NRB}`);
    expect(normalizeIban('de89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000');
  });

  it('faktura z rachunkiem bez PL przechodzi walidację i XSD; NrRB to same cyfry', async () => {
    const f = faktura({ payment: { currency: 'PLN', dueDate: '2026-10-15', method: 'transfer', bankAccount: '61-1090-1014-0000-0712-1981-2874' } });
    expect(validateInvoice(f, new Date('2026-10-01T12:00:00Z'))).toEqual([]);
    const xml = generateFA3Xml(f, { generatedAt: new Date('2026-10-01T12:00:00Z') });
    expect(xml).toContain(`<NrRB>${NRB}</NrRB>`);
    expect((await validateInvoiceXml(xml)).valid).toBe(true);
  });
});

describe('formularz pilnuje tego, co sprawdza wysyłka', () => {
  it('poprawny formularz z NRB — bez błędów', () => {
    expect(bledy(formularz())).toEqual([]);
  });

  it('przelew bez rachunku — błąd przy polu rachunku', () => {
    expect(bledy(formularz({ bankAccount: '' }))).toContain('bankAccount: Przy przelewie podaj numer rachunku');
  });

  it('literówka w rachunku — błąd przy polu rachunku', () => {
    expect(bledy(formularz({ bankAccount: '61109010140000071219812875' })).join('\n')).toContain('bankAccount: Nieprawidłowy numer rachunku');
  });

  it('gotówka bez rachunku — w porządku', () => {
    expect(bledy(formularz({ paymentMethod: 'cash', bankAccount: '' }))).toEqual([]);
  });

  it('data wystawienia > 30 dni w przód albo przed 1.09.2025 — błąd przy dacie', () => {
    const dalekoWPrzod = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    expect(bledy(formularz({ issueDate: dalekoWPrzod })).join('\n')).toContain('issueDate: Data wystawienia');
    expect(bledy(formularz({ issueDate: '2025-08-31', paymentDueDate: '2025-09-30' })).join('\n')).toContain('minimalna data FA(3)');
  });

  it('zakres dat — ta sama reguła co przy wysyłce', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    expect(issueDateRangeErrors('2026-10-31', now)).toEqual([]);
    expect(issueDateRangeErrors('2026-11-01', now)).toHaveLength(1);
    expect(validateInvoice(faktura({ issueDate: '2026-11-15', saleDate: '2026-11-15', payment: { currency: 'PLN', dueDate: '2026-11-30', method: 'transfer', bankAccount: NRB } }), now))
      .toEqual(issueDateRangeErrors('2026-11-15', now));
  });
});
