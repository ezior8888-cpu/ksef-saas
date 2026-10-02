import PDFDocument from 'pdfkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderInvoicePdf } from '@/lib/pdf/invoice-renderer';
import type { Invoice, VatRate } from '@/types/invoice';

/**
 * F-067 (audyt bloku 1, część PDF): faktury z importu historii KSeF mają
 * w pozycjach surowe kody stawek FA(3) („0 KR”, „np I”, „0 WDT”). Mapa
 * etykiet ich nie zna, więc PDF drukował pustą komórkę stawki i w
 * podsumowaniu „undefined netto 100,00”.
 */

function faktura(rate: string): Invoice {
  return {
    internalNumber: 'FV/IMP/1',
    type: 'VAT',
    issueDate: '2026-09-15',
    seller: { nip: '5260001246', name: 'Dostawca', address: { countryCode: 'PL', addressLine1: 'ul. A 1', addressLine2: '00-001 Warszawa' } },
    buyer: { nip: '5252241585', name: 'Klient', address: { countryCode: 'PL', addressLine1: 'ul. B 2', addressLine2: '00-002 Warszawa' } },
    lines: [{ ordinal: 1, name: 'Towar', unit: 'szt', quantity: 1, unitPriceNet: 100, vatRate: rate as VatRate, netAmount: 100, vatAmount: 0, grossAmount: 100 }],
    netTotal: 100,
    vatTotal: 0,
    grossTotal: 100,
    payment: { amountDue: 100, currency: 'PLN', dueDate: '2026-09-29', method: 'transfer' },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PDF — stawka z importu historii (F-067)', () => {
  it.each(['0 KR', 'np I', '0 WDT'])('stawka „%s” drukowana kodem, bez „undefined”', async (rate) => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await renderInvoicePdf(faktura(rate));
    const printed = text.mock.calls.map((c) => String(c[0]));
    expect(printed.some((t) => t.includes('undefined'))).toBe(false);
    expect(printed).toContain(rate);
    expect(printed.some((t) => t.startsWith(`${rate}  netto`))).toBe(true);
  });

  it('znane stawki bez zmian', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await renderInvoicePdf({ ...faktura('23'), lines: [{ ...faktura('23').lines[0]!, vatAmount: 23, grossAmount: 123 }] });
    const printed = text.mock.calls.map((c) => String(c[0]));
    expect(printed).toContain('23%');
  });
});
