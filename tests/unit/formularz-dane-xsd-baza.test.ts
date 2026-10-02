import { describe, expect, it } from 'vitest';

import { invoiceFormSchema, type InvoiceFormValues } from '@/lib/schemas/invoice-form';

/**
 * F-041 (audyt bloku 1): formularz przyjmował dane, które odrzuca dopiero
 * XSD FA(3) albo baza — po zapisie, gdy faktura była już w kolejce:
 *  - znak sterujący w tekście (np. pionowy tabulator wklejony z Worda) —
 *    „PCDATA invalid Char value 11” w XSD,
 *  - numer faktury z samych spacji (P_2 minLength),
 *  - nazwa / adres nabywcy ponad 512 znaków (XSD),
 *  - jednostka ponad 50 znaków (VARCHAR(50)),
 *  - kwoty poza NUMERIC(12,2) i więcej miejsc po przecinku niż NUMERIC(14,4).
 */

const base: InvoiceFormValues = {
  internalNumber: 'FV/1/10/2026', issueDate: '2026-10-02', saleDate: '',
  buyerNip: '5252241585', buyerName: 'Klient', buyerAddressLine1: 'ul. B 2',
  buyerAddressLine2: '00-002 Warszawa', buyerEmail: '', buyerIsConsumer: false,
  buyerPesel: '', buyerIdDocument: '', paymentMethod: 'transfer', paymentDueDate: '2026-10-16',
  bankAccount: 'PL61109010140000071219812874', notes: 'Dziękujemy\nza zakupy',
  lines: [{ name: 'Usługa', unit: 'szt', quantity: 1, unitPriceNet: 100, vatRate: '23' }],
};

const line = (o: Partial<InvoiceFormValues['lines'][number]>) => ({ ...base, lines: [{ ...base.lines[0]!, ...o }] });

function bledy(v: InvoiceFormValues): string[] {
  const r = invoiceFormSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('formularz faktury — dane, których nie przyjmie XSD ani baza (F-041)', () => {
  it('poprawne dane (z nową linią w uwagach) przechodzą', () => {
    expect(bledy(base)).toEqual([]);
  });

  it.each([
    ['nazwa pozycji', line({ name: 'Usługa\u000Bwdrożeniowa' }), 'lines.0.name'],
    ['jednostka', line({ unit: 'szt\u0007' }), 'lines.0.unit'],
    ['numer faktury', { ...base, internalNumber: 'FV\u00011' }, 'internalNumber'],
    ['nazwa nabywcy', { ...base, buyerName: 'Klient\u001F' }, 'buyerName'],
    ['adres nabywcy', { ...base, buyerAddressLine1: 'ul.\u000CB' }, 'buyerAddressLine1'],
    ['uwagi', { ...base, notes: 'uwaga\u000B' }, 'notes'],
  ])('znak sterujący — %s', (_label, v, path) => {
    expect(bledy(v as InvoiceFormValues).some((e) => e.startsWith(path) && e.includes('znaki sterujące'))).toBe(true);
  });

  it('numer faktury z samych spacji — odrzucony', () => {
    expect(bledy({ ...base, internalNumber: '   ' }).some((e) => e.startsWith('internalNumber'))).toBe(true);
  });

  it('nazwa i adres nabywcy ponad 512 znaków — odrzucone', () => {
    const dlugi = 'x'.repeat(513);
    expect(bledy({ ...base, buyerName: dlugi }).some((e) => e.startsWith('buyerName'))).toBe(true);
    expect(bledy({ ...base, buyerAddressLine2: dlugi }).some((e) => e.startsWith('buyerAddressLine2'))).toBe(true);
  });

  it('jednostka ponad 50 znaków — odrzucona', () => {
    expect(bledy(line({ unit: 'j'.repeat(51) })).some((e) => e.startsWith('lines.0.unit'))).toBe(true);
  });

  it('więcej niż 4 miejsca po przecinku w ilości i cenie — odrzucone', () => {
    expect(bledy(line({ quantity: 1.23456 })).some((e) => e.startsWith('lines.0.quantity'))).toBe(true);
    expect(bledy(line({ unitPriceNet: 0.12345 })).some((e) => e.startsWith('lines.0.unitPriceNet'))).toBe(true);
    expect(bledy(line({ quantity: 1.2345, unitPriceNet: 5.6789 }))).toEqual([]);
  });

  it('kwota faktury poza zakresem bazy (10 mld zł) — odrzucona', () => {
    expect(bledy(line({ quantity: 1_000_000_000, unitPriceNet: 1_000_000 })).length).toBeGreaterThan(0);
    expect(bledy(line({ quantity: 9, unitPriceNet: 1_000_000_000 })).length).toBeGreaterThan(0); // brutto 11,07 mld
    expect(bledy(line({ quantity: 1, unitPriceNet: 1_000_000_000 }))).toEqual([]);
  });
});
