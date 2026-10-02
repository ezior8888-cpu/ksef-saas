import { describe, expect, it } from 'vitest';

import { generateCorrectionInvoiceXml } from '@/lib/ksef/fa3-correction-generator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import type { CorrectionInvoiceData, InvoiceLine } from '@/types/invoice-types';

/**
 * F-049 (audyt bloku 1): korekta faktury, która ma numer KSeF, wpisywała go do
 * elementu `NumerKSeFFaKorygowanej`. Schemat FA(3) zna tylko
 * `NrKSeFFaKorygowanej` (`lib/xml/schemas/fa3/schemat.xsd`, DaneFaKorygowanej),
 * więc każda taka korekta — a korygować można tylko faktury przyjęte w KSeF —
 * odpadała na lokalnej walidacji XSD i nie trafiała do KSeF.
 */

const PARENT_KSEF_NUMBER = '1234567890-20260930-0100001AF629-AF';

const line = (o: Partial<InvoiceLine> = {}): InvoiceLine => ({
  name: 'Usługa wdrożeniowa', unit: 'szt.', quantity: 10, unitPriceNet: 100, vatRate: '23', ...o,
});

function correction(parentKsefNumber: string | undefined): CorrectionInvoiceData {
  return {
    invoiceType: 'correction',
    internalNumber: 'FK 1/10/2026',
    issueDate: '2026-10-02',
    paymentMethod: 'transfer',
    paymentDueDate: '2026-10-16',
    parentInvoiceId: '00000000-0000-4000-8000-000000000001',
    parentInvoiceNumber: 'FV 1/09/2026',
    parentInvoiceIssueDate: '2026-09-30',
    parentKsefNumber,
    correctionType: 'before_after',
    correctionReason: 'Zmiana ilości po reklamacji',
    typKorekty: '2',
    seller: { nip: '1234567890', name: 'Sprzedawca testowy', address: { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' } },
    buyer: { type: 'b2b', idType: 'nip', nip: '1234567890', name: 'Nabywca testowy', address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' } },
    linesBefore: [line()],
    linesAfter: [line({ quantity: 8 })],
  } as CorrectionInvoiceData;
}

const generatedAt = new Date('2026-10-02T10:00:00Z');

describe('korekta faktury z numerem KSeF (F-049)', () => {
  const xml = generateCorrectionInvoiceXml(correction(PARENT_KSEF_NUMBER), { generatedAt });

  it('numer KSeF faktury korygowanej w elemencie NrKSeFFaKorygowanej', () => {
    expect(xml).toContain('<NrKSeF>1</NrKSeF>');
    expect(xml).toContain(`<NrKSeFFaKorygowanej>${PARENT_KSEF_NUMBER}</NrKSeFFaKorygowanej>`);
    expect(xml).not.toContain('NumerKSeFFaKorygowanej');
  });

  it('przechodzi oficjalny XSD FA(3)', async () => {
    const wynik = await validateInvoiceXml(xml);
    expect(wynik.errors).toEqual([]);
    expect(wynik.valid).toBe(true);
  });

  it('korekta faktury spoza KSeF nadal oznacza NrKSeFN i przechodzi XSD', async () => {
    const bezNumeru = generateCorrectionInvoiceXml(correction(undefined), { generatedAt });
    expect(bezNumeru).toContain('<NrKSeFN>1</NrKSeFN>');
    expect(bezNumeru).not.toContain('NrKSeFFaKorygowanej');
    const wynik = await validateInvoiceXml(bezNumeru);
    expect(wynik.valid).toBe(true);
  });
});
