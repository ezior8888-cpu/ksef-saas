import PDFDocument from 'pdfkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildInvoiceAnnotations,
  SPLIT_PAYMENT_LABEL,
  SPLIT_PAYMENT_THRESHOLD_PLN,
  suggestsSplitPayment,
} from '@/lib/invoices/annotations';
import { renderInvoicePdf } from '@/lib/pdf/invoice-renderer';
import { invoiceFormSchema, type InvoiceFormValues } from '@/lib/schemas/invoice-form';
import { generateFA3Xml } from '@/lib/xml/fa3-generator';
import { finalizeInvoice, type InvoiceInput } from '@/lib/xml/invoice-calculator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import type { Invoice } from '@/types/invoice';

/**
 * Mechanizm podzielonej płatności (P_18A) — obowiązkowy na fakturze B2B
 * ≥ 15 000 zł brutto z towarem/usługą z zał. 15 (sankcja 30% VAT). Do 27.09
 * generator go znał, ale nic go nie ustawiało: każda faktura szła z P_18A=2.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('adnotacje faktury', () => {
  const zw = [{ vatRate: 'zw' as const }];
  const vat23 = [{ vatRate: '23' as const }];

  it.each([
    ['nic', vat23, null, false, undefined],
    ['MPP', vat23, null, true, { splitPayment: 1 }],
    ['zw z podstawą', zw, 'art. 113 ust. 1 ustawy o VAT', false, { vatExemptionBasis: 'art. 113 ust. 1 ustawy o VAT' }],
    ['zw + MPP', zw, 'art. 113 ust. 1 ustawy o VAT', true, { vatExemptionBasis: 'art. 113 ust. 1 ustawy o VAT', splitPayment: 1 }],
    ['podstawa bez pozycji zw — bez P_19A', vat23, 'art. 113 ust. 1 ustawy o VAT', false, undefined],
  ])('%s', (_opis, lines, basis, split, expected) => {
    expect(buildInvoiceAnnotations({ lines, vatExemptionBasis: basis, splitPayment: split })).toEqual(expected);
  });
});

describe('podpowiedź MPP', () => {
  it.each([
    [SPLIT_PAYMENT_THRESHOLD_PLN, false, true],
    [SPLIT_PAYMENT_THRESHOLD_PLN - 0.01, false, false],
    [50_000, true, false], // konsument — MPP dotyczy firm
  ])('brutto %d, konsument %s → %s', (gross, consumer, expected) => {
    expect(suggestsSplitPayment(gross, consumer)).toBe(expected);
  });
});

describe('formularz: MPP wymaga przelewu na rachunek', () => {
  const base: InvoiceFormValues = {
    internalNumber: 'FV 1/09/2026',
    issueDate: '2026-09-27',
    saleDate: '',
    buyerNip: '5252241585',
    buyerName: 'Klient Sp. z o.o.',
    buyerAddressLine1: 'ul. Klienta 10',
    buyerAddressLine2: '02-001 Warszawa',
    buyerEmail: '',
    buyerIsConsumer: false,
    buyerPesel: '',
    buyerIdDocument: '',
    lines: [{ name: 'Roboty budowlane', unit: 'usł.', quantity: 1, unitPriceNet: 20_000, vatRate: '23' }],
    paymentMethod: 'transfer',
    paymentDueDate: '2026-10-11',
    bankAccount: 'PL61109010140000071219812874',
    notes: '',
    splitPayment: true,
  };
  const bladMpp = (v: InvoiceFormValues) => {
    const r = invoiceFormSchema.safeParse(v);
    return r.success ? null : r.error.issues.find((i) => i.path[0] === 'splitPayment')?.message ?? null;
  };

  it('przelew + rachunek — OK', () => {
    expect(bladMpp(base)).toBeNull();
  });
  it('gotówka — błąd', () => {
    expect(bladMpp({ ...base, paymentMethod: 'cash' })).toMatch(/wymaga przelewu/);
  });
  it('przelew bez rachunku — błąd', () => {
    expect(bladMpp({ ...base, bankAccount: '  ' })).toMatch(/numer rachunku/);
  });
  it('bez MPP rachunek nie jest wymagany', () => {
    expect(bladMpp({ ...base, splitPayment: false, bankAccount: '', paymentMethod: 'cash' })).toBeNull();
  });
});

function faktura(annotations: Invoice['annotations']): Invoice {
  const input: InvoiceInput = {
    internalNumber: 'FV 1/09/2026',
    type: 'VAT',
    issueDate: '2026-09-27',
    saleDate: '2026-09-27',
    seller: {
      nip: '5260001246',
      name: 'Budowlanka Sp. z o.o.',
      address: { countryCode: 'PL', addressLine1: 'ul. Przykładowa 1', addressLine2: '00-001 Warszawa' },
    },
    buyer: {
      nip: '5252241585',
      name: 'Klient Sp. z o.o.',
      address: { countryCode: 'PL', addressLine1: 'ul. Klienta 10', addressLine2: '02-001 Warszawa' },
    },
    lines: [{ ordinal: 1, name: 'Roboty budowlane', unit: 'usł.', quantity: 1, unitPriceNet: 20_000, vatRate: '23' }],
    payment: { currency: 'PLN', dueDate: '2026-10-11', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
  };
  return { ...finalizeInvoice(input), annotations };
}

describe('FA(3) i PDF z MPP', () => {
  it('XML: P_18A=1 i zgodność z oficjalnym schematem FA(3)', async () => {
    const xml = generateFA3Xml(faktura({ splitPayment: 1 }));
    expect(xml).toContain('<P_18A>1</P_18A>');
    const v = await validateInvoiceXml(xml);
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it('XML bez MPP: P_18A=2', () => {
    expect(generateFA3Xml(faktura(undefined))).toContain('<P_18A>2</P_18A>');
  });

  it('PDF drukuje obowiązkowe wyrazy „mechanizm podzielonej płatności”', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await renderInvoicePdf(faktura({ splitPayment: 1 }));
    expect(text.mock.calls.map((c) => String(c[0]))).toContain(SPLIT_PAYMENT_LABEL);
  });

  it('PDF bez MPP — bez dopisku', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await renderInvoicePdf(faktura(undefined));
    expect(text.mock.calls.map((c) => String(c[0]))).not.toContain(SPLIT_PAYMENT_LABEL);
  });
});
