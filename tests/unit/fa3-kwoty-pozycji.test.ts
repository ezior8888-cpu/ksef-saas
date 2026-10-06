import { describe, expect, it } from 'vitest';

import type { ParsedInvoice, ParsedLine } from '@/lib/import/fa3-parser';
import { fa3ImportLineAmounts, legacyLineAmounts } from '@/lib/import/fa3-line-amounts';

/**
 * C5c: czysty rozkład kwot pozycji (`lib/import/fa3-line-amounts.ts`) —
 * przypadki, których nie da się wygodnie zbudować z pliku generatora.
 */

function line(position: number, vatRate: string, ksef: ParsedLine['ksef']): ParsedLine {
  return { position, name: `Poz ${position}`, unit: 'szt.', quantity: 1, unitPriceNet: 0, vatRate, netAmount: 0, ksef };
}
function invoice(lines: ParsedLine[], ksefSums: ParsedInvoice['ksefSums'], o: Partial<ParsedInvoice> = {}): ParsedInvoice {
  return {
    invoiceNumber: 'FV/T/1', issueDate: '2026-09-10', invoiceType: 'regular',
    seller: { name: 'S' }, buyer: { name: 'N' }, lines,
    totals: { netTotal: 0, vatTotal: 0, grossTotal: 0 }, warnings: [], ksefSums, ...o,
  };
}

describe('fa3ImportLineAmounts', () => {
  it('plik spoza KSeF (bez ksefSums) → jak dotąd, bajt w bajt (VAT = netto × stawka)', () => {
    const l = { ...line(1, '23', undefined), netAmount: 0.1, unitPriceNet: 0.1 };
    const inv = invoice([l, { ...l, position: 2 }, { ...l, position: 3 }], undefined);
    const result = fa3ImportLineAmounts(inv);
    expect(result.rows).toEqual([1, 2, 3].map((n) => ({ ordinal: n, unitPriceNet: 0.1, netAmount: 0.1, vatAmount: 0.02, grossAmount: 0.12 })));
    expect(result.problems).toEqual([]);
    expect(result).not.toHaveProperty('ksefLineFields');
    expect(legacyLineAmounts({ ...l, vatRate: 'zw', netAmount: 50 })).toMatchObject({ vatAmount: 0, grossAmount: 50 });
  });

  it('kwota nieczytelna (przecinek, tekst) → problem, nigdy ciche 0', () => {
    const r = fa3ImportLineAmounts(invoice([line(1, '23', { P_11A: '12,30' })], { P_13_1: '10.00', P_14_1: '2.30', P_15: '12.30' }));
    expect(r.problems).toEqual(['pozycja 1: P_11A „12,30” nieczytelne']);
  });

  it('P_11Vat ≠ P_11A − P_11 → problem z kwotami', () => {
    const r = fa3ImportLineAmounts(invoice([line(1, '23', { P_11: '100.00', P_11A: '123.00', P_11Vat: '22.00' })], { P_13_1: '100.00', P_14_1: '23.00', P_15: '123.00' }));
    expect(r.problems).toEqual(['pozycja 1: P_11A − P_11 = 23.00 ≠ P_11Vat 22.00']);
  });

  it('stawka bez podatku z VAT pozycji → problem', () => {
    const r = fa3ImportLineAmounts(invoice([line(1, 'zw', { P_11A: '50.00', P_11Vat: '1.00' })], { P_13_7: '50.00', P_15: '50.00' }));
    expect(r.problems).toEqual(['pozycja 1: stawka zw bez podatku, a VAT 1.00']);
  });

  it('dwie ujemne pozycje brutto → podłoga w stronę −∞, VAT z nagłówka co do grosza', () => {
    // −10,00 i −1,00 brutto przy 23%: KP = round(−11,00 × 23 / 123) = −2,06.
    const r = fa3ImportLineAmounts(invoice(
      [line(1, '23', { P_11A: '-10.00' }), line(2, '23', { P_11A: '-1.00' })],
      { P_13_1: '-8.94', P_14_1: '-2.06', P_15: '-11.00' },
    ));
    expect(r.problems).toEqual([]);
    expect(r.rows.map((x) => x.vatAmount)).toEqual([-1.87, -0.19]);
    expect(r.rows.map((x) => x.netAmount)).toEqual([-8.13, -0.81]);
  });

  it('stawka 23% i 22% w jednej sumie P_13_1 → reszty porównane na krzyż (różne mianowniki)', () => {
    // 10,00 brutto przy 23% (udział 186,99 gr) i 10,00 przy 22% (180,33 gr): F = 366, C = 368.
    const r = fa3ImportLineAmounts(invoice(
      [line(1, '22', { P_11A: '10.00' }), line(2, '23', { P_11A: '10.00' })],
      { P_13_1: '16.33', P_14_1: '3.67', P_15: '20.00' },
    ));
    expect(r.problems).toEqual([]);
    // Większa reszta: 23% (0,99) przed 22% (0,33) — mimo niższego numeru pozycji 22%.
    expect(r.rows.map((x) => x.vatAmount)).toEqual([1.8, 1.87]);
  });

  it('wynik przechodzi przez JSON (supabase-js) — bez BigInt, NaN, Infinity', () => {
    const r = fa3ImportLineAmounts(invoice([line(1, '23', { P_9B: '33.33', P_11A: '33.33', P_8B: '1.0000' })], { P_13_1: '27.10', P_14_1: '6.23', P_15: '33.33' }));
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(r.ksefLineFields).toEqual([{ ordinal: 1, P_8B: 1, P_9B: 33.33, P_11A: 33.33 }]);
  });
});
