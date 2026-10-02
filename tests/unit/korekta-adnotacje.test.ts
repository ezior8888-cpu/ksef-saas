import { describe, expect, it } from 'vitest';

import { parentAnnotationsForCorrection } from '@/lib/invoices/correction-annotations';
import { generateCorrectionInvoiceXml } from '@/lib/ksef/fa3-correction-generator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import type { CorrectionInvoiceData } from '@/types/invoice-types';

/**
 * AUD-23 (część KOR; ZAL/ROZ w PR Codexa #85): korekta miała na sztywno
 * P_16=2 (metoda kasowa) i P_18A=2 (MPP). Faktura korygująca fakturę firmy
 * na metodzie kasowej albo fakturę z MPP traciła adnotację. Teraz korekta
 * przejmuje je z faktury pierwotnej.
 */

const base = (annotations?: CorrectionInvoiceData['annotations']): CorrectionInvoiceData => ({
  invoiceType: 'correction',
  internalNumber: 'FK 2/10/2026',
  issueDate: '2026-10-02',
  paymentMethod: 'transfer',
  paymentDueDate: '2026-10-16',
  parentInvoiceId: '00000000-0000-4000-8000-000000000001',
  parentInvoiceNumber: 'FV 1/09/2026',
  parentInvoiceIssueDate: '2026-09-30',
  correctionType: 'before_after',
  correctionReason: 'Zmiana ceny',
  typKorekty: '2',
  seller: { nip: '1234567890', name: 'Sprzedawca testowy', address: { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' } },
  buyer: { type: 'b2b', idType: 'nip', nip: '1234567890', name: 'Nabywca testowy', address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' } },
  linesBefore: [{ name: 'Usługa', unit: 'szt.', quantity: 1, unitPriceNet: 20000, vatRate: '23' }],
  linesAfter: [{ name: 'Usługa', unit: 'szt.', quantity: 1, unitPriceNet: 18000, vatRate: '23' }],
  ...(annotations ? { annotations } : {}),
}) as CorrectionInvoiceData;

describe('adnotacje faktury korygującej (AUD-23, KOR)', () => {
  it('pierwotna z metodą kasową i MPP — korekta też, XML zgodny z XSD', async () => {
    const xml = generateCorrectionInvoiceXml(base({ cashMethod: 1, splitPayment: 1 }));
    expect(xml).toContain('<P_16>1</P_16>');
    expect(xml).toContain('<P_18A>1</P_18A>');
    expect((await validateInvoiceXml(xml)).valid).toBe(true);
  });

  it('bez adnotacji pierwotnej — jak dotąd 2', () => {
    const xml = generateCorrectionInvoiceXml(base());
    expect(xml).toContain('<P_16>2</P_16>');
    expect(xml).toContain('<P_18A>2</P_18A>');
  });

  it('odczyt z fa3_data faktury pierwotnej — tylko 1 lub 2', () => {
    expect(parentAnnotationsForCorrection({ annotations: { cashMethod: 1, splitPayment: 1 } })).toEqual({ cashMethod: 1, splitPayment: 1 });
    expect(parentAnnotationsForCorrection({ annotations: { cashMethod: 2 } })).toEqual({ cashMethod: 2, splitPayment: 2 });
    expect(parentAnnotationsForCorrection({ annotations: { cashMethod: 'tak' } })).toEqual({ cashMethod: 2, splitPayment: 2 });
    expect(parentAnnotationsForCorrection(null)).toEqual({ cashMethod: 2, splitPayment: 2 });
  });
});
