import { describe, expect, it } from 'vitest';
import { amountDueOf, outstandingOf } from '@/lib/invoices/amount-due';

/**
 * C-16 — kwota do zapłaty ROZ liczona z `payment_data.amountDue`, nie
 * z całego `gross_total`. Scenariusz z zadania: ROZ brutto 12 300,
 * zaliczka 2 460, `amountDue` 9 840.
 */
describe('amountDueOf', () => {
  it('dla ROZ (invoice_kind=final) bierze payment_data.amountDue, nie gross_total', () => {
    expect(
      amountDueOf({
        invoice_kind: 'final',
        gross_total: 12300,
        payment_data: { amountDue: 9840 },
      }),
    ).toBe(9840);
  });

  it('dla każdego innego rodzaju faktury to całe gross_total', () => {
    for (const kind of ['regular', 'advance', 'correction', null, undefined]) {
      expect(
        amountDueOf({ invoice_kind: kind, gross_total: 1230, payment_data: { amountDue: 1 } }),
      ).toBe(1230);
    }
  });

  it('nigdy nie przekracza gross_total, choćby payment_data mówiło więcej', () => {
    expect(
      amountDueOf({ invoice_kind: 'final', gross_total: 1000, payment_data: { amountDue: 5000 } }),
    ).toBe(1000);
  });

  it.each([
    ['brak payment_data', undefined],
    ['null', null],
    ['brak pola amountDue', {}],
    ['napis nieliczbowy', { amountDue: 'zepsute' }],
    ['NaN', { amountDue: NaN }],
    ['Infinity', { amountDue: Infinity }],
    ['ujemna', { amountDue: -100 }],
    ['tablica zamiast obiektu', []],
  ])('fail-safe: %s → całe gross_total', (_label, paymentData) => {
    expect(
      amountDueOf({ invoice_kind: 'final', gross_total: 12300, payment_data: paymentData }),
    ).toBe(12300);
  });

  it('przyjmuje amountDue jako napis liczbowy (tak jak Supabase JSON bywa odczytany)', () => {
    expect(
      amountDueOf({ invoice_kind: 'final', gross_total: 12300, payment_data: { amountDue: '9840' } }),
    ).toBe(9840);
  });

  it('amountDue = 0 jest poprawną, liczoną wartością (nie fail-safe)', () => {
    expect(
      amountDueOf({ invoice_kind: 'final', gross_total: 12300, payment_data: { amountDue: 0 } }),
    ).toBe(0);
  });

  it('fail-safe gdy gross_total jest zepsute: traktuje jako 0', () => {
    expect(amountDueOf({ invoice_kind: 'regular', gross_total: null, payment_data: null })).toBe(0);
    expect(amountDueOf({ invoice_kind: 'regular', gross_total: 'zepsute', payment_data: null })).toBe(0);
  });
});

describe('outstandingOf', () => {
  it('scenariusz z zadania: ROZ 12 300 brutto, zaliczka 2 460, amountDue 9 840, nic niewpłacone → 9 840', () => {
    expect(
      outstandingOf({
        invoice_kind: 'final',
        gross_total: 12300,
        payment_data: { amountDue: 9840 },
        paid_amount: 0,
      }),
    ).toBe(9840);
  });

  it('ten sam scenariusz po wpłacie 9 840 → zaległość 0 (zapłacona)', () => {
    expect(
      outstandingOf({
        invoice_kind: 'final',
        gross_total: 12300,
        payment_data: { amountDue: 9840 },
        paid_amount: 9840,
      }),
    ).toBe(0);
  });

  it('nigdy nie schodzi poniżej zera, choćby wpłacono więcej niż amountDue', () => {
    expect(
      outstandingOf({
        invoice_kind: 'final',
        gross_total: 12300,
        payment_data: { amountDue: 9840 },
        paid_amount: 15000,
      }),
    ).toBe(0);
  });

  it('dla zwykłej faktury to zwykłe gross_total minus zapłacone', () => {
    expect(
      outstandingOf({ invoice_kind: 'regular', gross_total: 1230, payment_data: null, paid_amount: 230 }),
    ).toBe(1000);
  });

  it('zaokrągla do groszy', () => {
    expect(
      outstandingOf({
        invoice_kind: 'final',
        gross_total: 100,
        payment_data: { amountDue: 33.333 },
        paid_amount: 10.111,
      }),
    ).toBe(23.22);
  });
});
