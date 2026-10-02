import PDFDocument from 'pdfkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hasReverseChargeLine, REVERSE_CHARGE_LABEL } from '@/lib/invoices/annotations';
import { renderInvoicePdf } from '@/lib/pdf/invoice-renderer';
import { finalizeInvoice, type InvoiceInput } from '@/lib/xml/invoice-calculator';
import type { VatRate } from '@/types/invoice';

/**
 * AUD-70: usługa z art. 100 ust. 1 pkt 4 („np_ii”, art. 28b — nabywca z UE).
 * Podatek rozlicza nabywca, więc faktura musi mieć wyrazy „odwrotne
 * obciążenie” (art. 106e ust. 1 pkt 18) — tak samo jak przy „oo”. Nabywca
 * z UE zwykle nie korzysta z KSeF i dostaje wyłącznie PDF.
 */

function faktura(...rates: VatRate[]) {
  const input: InvoiceInput = {
    internalNumber: 'FV 8/10/2026',
    type: 'VAT',
    issueDate: '2026-10-01',
    saleDate: '2026-10-01',
    seller: {
      nip: '5260001246',
      name: 'Moja Firma Sp. z o.o.',
      address: { countryCode: 'PL', addressLine1: 'ul. Przykładowa 1', addressLine2: '00-001 Warszawa' },
    },
    buyer: {
      vatUeNumber: 'DE123456789',
      name: 'Kunde GmbH',
      address: { countryCode: 'DE', addressLine1: 'Hauptstraße 1', addressLine2: '10115 Berlin' },
    },
    lines: rates.map((vatRate, i) => ({ ordinal: i + 1, name: `Usługa ${i + 1}`, unit: 'usł.', quantity: 1, unitPriceNet: 1000, vatRate })),
    payment: { currency: 'PLN', dueDate: '2026-10-15', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
  };
  return finalizeInvoice(input);
}

async function wydrukowane(rates: VatRate[]): Promise<string[]> {
  const text = vi.spyOn(PDFDocument.prototype, 'text');
  await renderInvoicePdf(faktura(...rates));
  return text.mock.calls.map((c) => String(c[0]));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PDF: „np_ii” — wyrazy „odwrotne obciążenie” i etykieta stawki', () => {
  it('pozycja „np_ii” — wyrazy na PDF', async () => {
    expect(await wydrukowane(['np_ii'])).toContain(REVERSE_CHARGE_LABEL);
  });

  it('„np_ii” obok „np” — też (wystarczy jedna pozycja)', async () => {
    expect(await wydrukowane(['np', 'np_ii'])).toContain(REVERSE_CHARGE_LABEL);
  });

  it('sama „np” (np I) — bez dopisku', async () => {
    expect(await wydrukowane(['np'])).not.toContain(REVERSE_CHARGE_LABEL);
  });

  it('kolumna stawki: „np. II” dla „np_ii”, „np.” dla „np”', async () => {
    const teksty = await wydrukowane(['np', 'np_ii']);
    expect(teksty).toContain('np. II');
    expect(teksty).toContain('np.');
    expect(teksty.some((t) => t.includes('np_ii'))).toBe(false);
  });
});

describe('hasReverseChargeLine — jedno źródło dla PDF i JPK', () => {
  it.each([
    [['oo'], true],
    [['np_ii'], true],
    [['23', 'np_ii'], true],
    [['np'], false],
    [['23', '0', 'zw', 'np'], false],
  ] as const)('%j → %s', (rates, oczekiwane) => {
    expect(hasReverseChargeLine(rates.map((vatRate) => ({ vatRate })))).toBe(oczekiwane);
  });
});
