import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { ExportExpense } from '@/lib/exports/data-fetcher';
import type { JpkInvoice } from '@/lib/exports/jpk-fa-generator';
import { generateJpkV7m, summarizeJpkV7m, vatPurchases } from '@/lib/exports/jpk-v7m-generator';
import { generateKpirXlsx, kpirCostColumn } from '@/lib/exports/kpir-generator';

/**
 * Koszty w eksporcie KPiR i JPK_V7M idą z listy wydatków — tego samego źródła
 * co KPiR w aplikacji. Do 26.09 szły z faktur otrzymanych:
 * - paragony nie trafiały do księgowej,
 * - wszystko lądowało w kol. 13 (kategoria ignorowana),
 * - „kontrahentem” / „dostawcą” była NASZA firma (pole nabywcy),
 * - faktura uznana przez klienta za „nie koszt” szła do odliczenia VAT.
 */

const ISSUER = { nip: '1234567890', name: 'Moja Firma' };

function koszt(o: Partial<ExportExpense> = {}): ExportExpense {
  return {
    id: 'exp-1',
    issueDate: '2026-08-10',
    documentNumber: 'FV/1/08',
    documentType: 'invoice',
    sellerName: 'Dostawca Sp. z o.o.',
    sellerNip: '5260001246',
    sellerAddress: 'ul. Dostawcza 1, 00-001 Warszawa',
    netAmount: 100,
    vatAmount: 23,
    grossAmount: 123,
    vatDeductibleAmount: 23,
    kpirColumn: 'col_13',
    categoryLabel: 'Usługi',
    ...o,
  };
}

function sprzedaz(o: Partial<JpkInvoice> = {}): JpkInvoice {
  return {
    invoiceNumber: 'FS/1/08',
    issueDate: '2026-08-05',
    buyerName: 'Klient',
    buyerNip: '5252241585',
    netTotal: 1000,
    vatTotal: 230,
    grossTotal: 1230,
    ksefNumber: '1234567890-20260805-ABC-01',
    lines: [{ name: 'Usługa', quantity: 1, unit: 'szt.', unitPriceNet: 1000, netAmount: 1000, vatRate: '23', vatAmount: 230 }],
    ...o,
  } as JpkInvoice;
}

async function arkusz(expenses: ExportExpense[], issued: JpkInvoice[] = []) {
  const buffer = await generateKpirXlsx({
    issuer: ISSUER,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    issuedInvoices: issued,
    expenses,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.getWorksheet('KPiR')!;
  const wiersz = (n: number) => (col: number) => sheet.getRow(n).getCell(col).value;
  return { sheet, wiersz };
}

describe('KPiR — kolumna kosztu z kategorii', () => {
  it('mapuje kategorie aplikacji na kolumny wzoru MF (B+R po znaczeniu → 16)', () => {
    expect(kpirCostColumn('col_10')).toBe(10);
    expect(kpirCostColumn('col_11')).toBe(11);
    expect(kpirCostColumn('col_12')).toBe(12);
    expect(kpirCostColumn('col_13')).toBe(13);
    expect(kpirCostColumn('col_15')).toBe(16);
    expect(kpirCostColumn('col_16')).toBe(16);
    expect(kpirCostColumn(null)).toBe(13);
    expect(kpirCostColumn('col_7')).toBeNull();
  });
});

describe('KPiR — arkusz', () => {
  it('nagłówki wg wzoru MF: 15 wolna, 16 B+R, 17 uwagi', async () => {
    const { wiersz } = await arkusz([]);
    const h = wiersz(1);
    expect(String(h(15))).toBe('(15)');
    expect(String(h(16))).toContain('B+R');
    expect(String(h(17))).toContain('Uwagi');
  });

  it('koszt: sprzedawca jako kontrahent, kwota w kolumnie z kategorii, 14 = 12 + 13', async () => {
    const { wiersz } = await arkusz([
      koszt({ id: 'a', kpirColumn: 'col_10', netAmount: 500 }),
      koszt({ id: 'b', kpirColumn: 'col_13', netAmount: 100 }),
    ]);
    const towary = wiersz(2);
    expect(towary(4)).toBe('Dostawca Sp. z o.o. (NIP 5260001246)');
    expect(towary(10)).toBe(500);
    expect(towary(13)).toBeNull();
    expect(towary(14)).toBeNull(); // zakup towarów nie wchodzi do 14

    const uslugi = wiersz(3);
    expect(uslugi(13)).toBe(100);
    expect(uslugi(14)).toBe(100);
  });

  it('B+R do kolumny 16; bez kategorii do 13 z uwagą; paragon z uwagą', async () => {
    const { wiersz } = await arkusz([
      koszt({ id: 'br', kpirColumn: 'col_15', netAmount: 40, issueDate: '2026-08-01' }),
      koszt({ id: 'bez', kpirColumn: null, netAmount: 30, issueDate: '2026-08-02' }),
      koszt({ id: 'par', documentType: 'receipt', netAmount: 20, issueDate: '2026-08-03' }),
    ]);
    expect(wiersz(2)(16)).toBe(40);
    expect(wiersz(2)(13)).toBeNull();
    expect(wiersz(3)(13)).toBe(30);
    expect(String(wiersz(3)(17))).toContain('bez kategorii');
    expect(String(wiersz(4)(17))).toContain('paragon');
  });

  it('koszt z kolumną przychodu: wiersz widoczny, bez kwot, z uwagą', async () => {
    const { wiersz } = await arkusz([koszt({ kpirColumn: 'col_7', netAmount: 999 })]);
    const w = wiersz(2);
    for (const col of [7, 9, 10, 11, 12, 13, 14, 16]) expect(w(col)).toBeNull();
    expect(String(w(17))).toContain('kolumną przychodu');
  });

  it('sprzedaż: numer KSeF w uwagach (17); podsumowanie per kolumna', async () => {
    const { sheet, wiersz } = await arkusz(
      [koszt({ id: 'a', kpirColumn: 'col_13', netAmount: 100 }), koszt({ id: 'b', kpirColumn: 'col_10', netAmount: 50 })],
      [sprzedaz()],
    );
    expect(wiersz(2)(7)).toBe(1000);
    expect(String(wiersz(2)(17))).toContain('KSeF: 1234567890-20260805-ABC-01');

    const suma = wiersz(sheet.rowCount);
    expect(suma(6)).toBe('PODSUMOWANIE OKRESU');
    expect(suma(7)).toBe(1000);
    expect(suma(10)).toBe(50);
    expect(suma(13)).toBe(100);
    expect(suma(14)).toBe(100);
  });
});

describe('JPK_V7M — zakupy z kosztów', () => {
  const dane = (expenses: ExportExpense[]) => ({
    issuer: ISSUER,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    issuedInvoices: [sprzedaz()],
    expenses,
  });

  it('do odliczenia tylko faktura i faktura uproszczona z niezerowym VAT do odliczenia', () => {
    const wybrane = vatPurchases([
      koszt({ id: 'fv', documentType: 'invoice' }),
      koszt({ id: 'upr', documentType: 'simplified_invoice' }),
      koszt({ id: 'par', documentType: 'receipt' }),
      koszt({ id: 'inne', documentType: 'other' }),
      koszt({ id: 'zero', vatDeductibleAmount: 0 }),
    ]);
    expect(wybrane.map((e) => e.id)).toEqual(['fv', 'upr']);
  });

  it('K_43 i P_48 to VAT DO ODLICZENIA, nie cały VAT z dokumentu (np. auto 50%)', () => {
    const data = dane([koszt({ netAmount: 1000, vatAmount: 230, vatDeductibleAmount: 115 })]);
    const xml = generateJpkV7m(data);
    expect(xml).toContain('<K_43>115.00</K_43>');
    expect(xml).toContain('<P_48>115.00</P_48>');
    expect(summarizeJpkV7m(data).vatDeductible).toBe(115);
  });

  it('dostawcą jest SPRZEDAWCA z kosztu, nie nasza firma', () => {
    const xml = generateJpkV7m(dane([koszt()]));
    expect(xml).toContain('<NrDostawcy>5260001246</NrDostawcy>');
    expect(xml).toContain('<NazwaDostawcy>Dostawca Sp. z o.o.</NazwaDostawcy>');
    expect(xml).not.toContain(`<NrDostawcy>${ISSUER.nip}</NrDostawcy>`);
  });

  it('paragon nie trafia do ewidencji zakupów ani do P_44', () => {
    const data = dane([koszt({ documentType: 'receipt', netAmount: 500 })]);
    const xml = generateJpkV7m(data);
    expect(xml).not.toContain('<ZakupWiersz>');
    expect(summarizeJpkV7m(data)).toMatchObject({ purchaseNet: 0, vatDeductible: 0, purchaseCount: 0 });
  });
});
