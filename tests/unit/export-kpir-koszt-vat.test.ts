import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { ExportExpense } from '@/lib/exports/data-fetcher';
import { generateKpirXlsx } from '@/lib/exports/kpir-generator';

/**
 * Eksport KPiR liczy koszt tą samą regułą co KPiR w aplikacji (#65):
 * netto + VAT bez prawa do odliczenia. Do 27.09 plik dla księgowej brał
 * netto zawsze — paragon za 1 230 zł szedł jako 1 000 zł, inaczej niż na
 * ekranie klienta.
 */

function koszt(o: Partial<ExportExpense>): ExportExpense {
  return {
    id: 'exp-1',
    issueDate: '2026-08-10',
    documentNumber: 'DOK/1',
    documentType: 'invoice',
    sellerName: 'Dostawca',
    sellerNip: '5260001246',
    sellerAddress: null,
    netAmount: 0,
    vatAmount: 0,
    grossAmount: 0,
    vatDeductibleAmount: 0,
    kpirColumn: 'col_13',
    categoryLabel: 'Usługi',
    ...o,
  };
}

async function arkusz(expenses: ExportExpense[]) {
  const buffer = await generateKpirXlsx({
    issuer: { nip: '1234567890', name: 'Moja Firma' },
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    issuedInvoices: [],
    expenses,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.getWorksheet('KPiR')!;
  return (n: number) => (col: number) => sheet.getRow(n).getCell(col).value;
}

describe('eksport KPiR — koszt jak w aplikacji', () => {
  it('paragon: koszt brutto (VAT bez prawa do odliczenia), z uwagą', async () => {
    const w = await arkusz([
      koszt({ documentType: 'receipt', netAmount: 1000, vatAmount: 230, grossAmount: 1230, vatDeductibleAmount: 230 }),
    ]);
    expect(w(2)(13)).toBe(1230);
    expect(w(2)(14)).toBe(1230);
    expect(String(w(2)(17))).toContain('w tym VAT bez odliczenia 230.00 zł');
  });

  it('faktura z pełnym odliczeniem: netto, bez uwagi o VAT', async () => {
    const w = await arkusz([koszt({ netAmount: 500, vatAmount: 115, grossAmount: 615, vatDeductibleAmount: 115 })]);
    expect(w(2)(13)).toBe(500);
    expect(String(w(2)(17) ?? '')).not.toContain('VAT bez odliczenia');
  });

  it('korekta in minus bez odliczenia (firma zwolniona): −brutto', async () => {
    const w = await arkusz([
      koszt({ netAmount: -100, vatAmount: -23, grossAmount: -123, vatDeductibleAmount: 0, kpirColumn: 'col_10' }),
    ]);
    expect(w(2)(10)).toBe(-123);
  });
});
