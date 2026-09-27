import PDFDocument from 'pdfkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.row, error: null }) }) }),
    }),
  }),
}));

import { buildInvoiceAnnotations, CASH_METHOD_LABEL } from '@/lib/invoices/annotations';
import { loadInvoiceForPdf } from '@/lib/pdf/invoice-data';
import { renderInvoicePdf } from '@/lib/pdf/invoice-renderer';
import { generateFA3Xml } from '@/lib/xml/fa3-generator';
import { finalizeInvoice, type InvoiceInput } from '@/lib/xml/invoice-calculator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import type { Invoice } from '@/types/invoice';

/**
 * Metoda kasowa VAT firmy (#76) na fakturze: P_16 = 1 w FA(3) i wyrazy
 * „metoda kasowa” (art. 106e ust. 1 pkt 16). Do 27.09 każda faktura szła
 * z P_16 = 2.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('adnotacja metody kasowej', () => {
  const vat23 = [{ vatRate: '23' as const }];

  it.each([
    ['metoda kasowa', null, true, { cashMethod: 1 }],
    ['memoriałowa', null, false, undefined],
    ['firma zwolniona — nie dotyczy', 'art. 113 ust. 1 ustawy o VAT', true, undefined],
  ])('%s', (_opis, basis, cash, expected) => {
    expect(
      buildInvoiceAnnotations({ lines: vat23, vatExemptionBasis: basis, splitPayment: false, cashMethod: cash }),
    ).toEqual(expected);
  });

  it('razem z MPP', () => {
    expect(
      buildInvoiceAnnotations({ lines: vat23, vatExemptionBasis: null, splitPayment: true, cashMethod: true }),
    ).toEqual({ splitPayment: 1, cashMethod: 1 });
  });
});

function faktura(annotations: Invoice['annotations']): Invoice {
  const input: InvoiceInput = {
    internalNumber: 'FV 2/09/2026',
    type: 'VAT',
    issueDate: '2026-09-27',
    saleDate: '2026-09-27',
    seller: {
      nip: '5260001246',
      name: 'Mała Firma',
      address: { countryCode: 'PL', addressLine1: 'ul. Przykładowa 1', addressLine2: '00-001 Warszawa' },
    },
    buyer: {
      nip: '5252241585',
      name: 'Klient Sp. z o.o.',
      address: { countryCode: 'PL', addressLine1: 'ul. Klienta 10', addressLine2: '02-001 Warszawa' },
    },
    lines: [{ ordinal: 1, name: 'Usługa', unit: 'szt.', quantity: 1, unitPriceNet: 1000, vatRate: '23' }],
    payment: { currency: 'PLN', dueDate: '2026-10-11', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
  };
  return { ...finalizeInvoice(input), annotations };
}

describe('FA(3) i PDF z metodą kasową', () => {
  it('XML: P_16=1 i zgodność z oficjalnym schematem FA(3)', async () => {
    const xml = generateFA3Xml(faktura({ cashMethod: 1 }));
    expect(xml).toContain('<P_16>1</P_16>');
    const v = await validateInvoiceXml(xml);
    expect(v.errors).toEqual([]);
  });

  it('PDF drukuje „metoda kasowa”', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await renderInvoicePdf(faktura({ cashMethod: 1 }));
    expect(text.mock.calls.map((c) => String(c[0]))).toContain(CASH_METHOD_LABEL);
  });

  it('loader PDF odczytuje metodę kasową z adnotacji', async () => {
    mocks.row = {
      id: 'inv-1',
      tenant_id: 'ten-1',
      internal_number: 'FV 2/09/2026',
      invoice_type: 'VAT',
      issue_date: '2026-09-27',
      sale_date: null,
      ksef_number: null,
      net_total: 1000,
      vat_total: 230,
      gross_total: 1230,
      notes: null,
      updated_at: '2026-09-27T10:00:00Z',
      pdf_storage_path: null,
      pdf_generated_at: null,
      seller_data: {},
      buyer_data: {},
      payment_data: {},
      annotations: { cashMethod: 1 },
      invoice_line_items: [],
    };
    const data = await loadInvoiceForPdf('inv-1');
    expect(data?.invoice.annotations).toEqual({ cashMethod: 1 });
  });
});
