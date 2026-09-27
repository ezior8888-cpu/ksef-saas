import PDFDocument from 'pdfkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  select: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (cols: string) => {
        mocks.select(cols);
        const query = {
          eq: mocks.eq,
          maybeSingle: async () => ({ data: mocks.row, error: null }),
        };
        mocks.eq.mockReturnValue(query);
        return query;
      },
    }),
  }),
}));

import { loadInvoiceForPdf } from '@/lib/pdf/invoice-data';
import { exemptionBasisLine, renderInvoicePdf } from '@/lib/pdf/invoice-renderer';
import type { Invoice } from '@/types/invoice';

/**
 * Faktura z pozycją „zw” musi podawać podstawę zwolnienia (art. 106e ust. 1
 * pkt 19 ustawy o VAT). W XML to P_19A; PDF — kopia dla nabywcy spoza
 * KSeF — do 27.09 jej nie miał, bo loader PDF nie czytał adnotacji.
 */

const PODSTAWA = 'art. 113 ust. 1 ustawy o VAT';

function faktura(vatRate: 'zw' | '23', annotations?: Invoice['annotations']): Invoice {
  const vat = vatRate === 'zw' ? 0 : 230;
  return {
    internalNumber: 'FV 1/09/2026',
    type: 'VAT',
    issueDate: '2026-09-25',
    saleDate: '2026-09-25',
    seller: {
      nip: '5260001246',
      name: 'Sprzedawca',
      address: { countryCode: 'PL', addressLine1: 'ul. Prosta 1', addressLine2: '00-001 Warszawa' },
    },
    buyer: {
      nip: '5252241585',
      name: 'Nabywca',
      address: { countryCode: 'PL', addressLine1: 'ul. Krzywa 2', addressLine2: '00-002 Warszawa' },
    },
    lines: [
      {
        ordinal: 1,
        name: 'Usługa',
        unit: 'szt',
        quantity: 1,
        unitPriceNet: 1000,
        netAmount: 1000,
        vatRate,
        vatAmount: vat,
        grossAmount: 1000 + vat,
      },
    ],
    netTotal: 1000,
    vatTotal: vat,
    grossTotal: 1000 + vat,
    payment: { currency: 'PLN', dueDate: '2026-10-09', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
    annotations,
  } as Invoice;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('podstawa zwolnienia na PDF faktury', () => {
  it.each([
    ['„zw” z podstawą', faktura('zw', { vatExemptionBasis: PODSTAWA }), `Zwolnienie z VAT — podstawa prawna: ${PODSTAWA}`],
    ['„zw” bez podstawy — nic nie zmyślamy', faktura('zw'), null],
    ['23% — bez dopisku, nawet gdy firma ma podstawę', faktura('23', { vatExemptionBasis: PODSTAWA }), null],
  ])('%s', (_opis, invoice, expected) => {
    expect(exemptionBasisLine(invoice)).toBe(expected);
  });

  it('renderer naprawdę drukuje podstawę w PDF', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    const pdf = await renderInvoicePdf(faktura('zw', { vatExemptionBasis: PODSTAWA }));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const wypisane = text.mock.calls.map((c) => String(c[0]));
    expect(wypisane).toContain(`Zwolnienie z VAT — podstawa prawna: ${PODSTAWA}`);
  });

  it('loader PDF czyta adnotacje z fa3_data (samą gałąź, nie cały snapshot)', async () => {
    mocks.row = {
      id: 'inv-1',
      tenant_id: 'ten-1',
      internal_number: 'FV 1/09/2026',
      invoice_type: 'VAT',
      issue_date: '2026-09-25',
      sale_date: null,
      ksef_number: null,
      net_total: 1000,
      vat_total: 0,
      gross_total: 1000,
      notes: null,
      updated_at: '2026-09-25T10:00:00Z',
      pdf_storage_path: null,
      pdf_generated_at: null,
      seller_data: {},
      buyer_data: {},
      payment_data: {},
      annotations: { vatExemptionBasis: ` ${PODSTAWA} ` },
      invoice_line_items: [],
    };
    const data = await loadInvoiceForPdf('inv-1', 'ten-1');
    expect(mocks.select.mock.calls[0]![0]).toContain('annotations:fa3_data->annotations');
    expect(mocks.eq).toHaveBeenCalledWith('tenant_id', 'ten-1');
    expect(data?.invoice.annotations).toEqual({ vatExemptionBasis: PODSTAWA });
  });

  it('loader: MPP z adnotacji (P_18A) trafia na PDF', async () => {
    mocks.row = { ...(mocks.row as Record<string, unknown>), annotations: { splitPayment: 1 } };
    // Od #77 loader wymaga firmy — dostęp do PDF ograniczony do tenanta.
    const data = await loadInvoiceForPdf('inv-1', 'ten-1');
    expect(data?.invoice.annotations).toEqual({ splitPayment: 1 });
  });

  it('loader: śmieci w adnotacjach nie trafiają na PDF', async () => {
    mocks.row = { id: 'inv-1', tenant_id: 'ten-1', issue_date: '2026-09-25', annotations: { vatExemptionBasis: 42 } };
    const data = await loadInvoiceForPdf('inv-1', 'ten-1');
    expect(data?.invoice.annotations).toBeUndefined();
  });
});
