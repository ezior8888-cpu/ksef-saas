import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { KpirView, type KpirExpenseRow, type KpirInvoiceRow } from '@/components/expenses/kpir-view';

/**
 * KPiR w układzie Transactions Finory (P13): kafle, tabela Lp. · Data · Nr
 * dowodu · Kontrahent · Opis · Kolumna · Kwota, karty poniżej `lg`.
 */

const sprzedaz = (o: Partial<KpirInvoiceRow>): KpirInvoiceRow => ({
  id: 'fv', internal_number: 'FV/1/2026', issue_date: '2026-09-05', sale_date: null, gross_total: 1230,
  net_total: 1000, buyer_data: { name: 'Nabywca spółka z ograniczoną odpowiedzialnością', nip: '1234567890' },
  invoice_kind: 'regular', settled_advances_net: null, ...o,
});

const koszt = (o: Partial<KpirExpenseRow>): KpirExpenseRow => ({
  id: 'exp', issue_date: '2026-09-03', seller_name: 'Dostawca', seller_nip: '5260001246', document_number: 'ZAK/7',
  category_label: 'Paliwo', kpir_column: 'col_13', is_deductible: true, net_amount: 1000, vat_amount: 230,
  gross_amount: 1230, vat_deductible_amount: 230, document_type: 'receipt', ...o,
} as KpirExpenseRow);

describe('KpirView — układ Finory', () => {
  it('kafle, kolumny tabeli, kwoty ze znakiem i Lp. w kolejności dat', () => {
    const html = renderToStaticMarkup(
      <KpirView month={9} year={2026} invoices={[sprzedaz({})]} expenses={[koszt({})]} />,
    );
    for (const text of ['Przychody (kol. 7–8)', 'Wydatki (kol. 14)', 'Wpisy w księdze',
      'Lp.', 'Data', 'Nr dowodu', 'Kontrahent', 'Opis', 'Kolumna', 'Kwota', 'Akcje',
      'Wrzesień 2026', 'Eksport KPiR', 'Wydatki według kolumn KPiR', 'Razem (kol. 14)']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('+1000,00 zł');
    expect(html).toContain('−1230,00 zł');
    expect(html).toContain('w tym VAT bez odliczenia 230,00');
    expect(html).toContain('03.09.2026');
    expect(html).toContain('05.09.2026');
    expect(html).toContain('Nabywca sp. z o.o.');
    expect(html).toContain('Kol. 7');
    expect(html).toContain('Kol. 13');
    // Koszt z 3.09 jest przed sprzedażą z 5.09 — Lp. 1 to ZAK/7.
    expect(html.indexOf('ZAK/7')).toBeLessThan(html.indexOf('FV/1/2026'));
    expect(html).toContain('href="/reports/exports?period=2026-09&amp;format=kpir_excel"');
    expect(html).toContain('href="/invoices/fv"');
    expect(html).toContain('href="/expenses/exp"');
    expect(html).toContain(`${(-230).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł`); // strata: 1000 − 1230
    expect(html).toContain('Strata');
    expect(html).not.toContain('ff-glass-pane');
    expect(html).not.toMatch(/\$[0-9]/);
  });

  it('korekta in minus: „−” zamiast „+-”; zaliczka i ROZ z opisem', () => {
    const html = renderToStaticMarkup(
      <KpirView month={9} year={2026} expenses={[]} invoices={[
        sprzedaz({ id: 'kor', internal_number: 'KOR/1', invoice_kind: 'correction', net_total: -300 }),
        sprzedaz({ id: 'zal', internal_number: 'ZAL/1', invoice_kind: 'advance', net_total: 400 }),
        sprzedaz({ id: 'roz', internal_number: 'ROZ/1', invoice_kind: 'final', net_total: 1000, settled_advances_net: 400 }),
      ]} />,
    );
    expect(html).toContain('−300,00 zł');
    expect(html).not.toContain('+-');
    expect(html).toContain('Korekta sprzedaży');
    expect(html).toContain('Zaliczka');
    expect(html).toContain('Faktura rozliczeniowa');
    expect(html).toContain('+600,00 zł');
    expect(html).toContain('zamówienie 1000,00, minus zaliczki 400,00');
  });

  it('pusty miesiąc: komunikat w tabeli, sumy zero', () => {
    const html = renderToStaticMarkup(<KpirView month={1} year={2027} expenses={[]} invoices={[]} />);
    expect(html).toContain('Brak przychodów i wydatków w tym okresie');
    expect(html).toContain('Styczeń 2027');
    expect(html).toContain('Brak pozycji');
  });
});
