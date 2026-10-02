import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';

import { generateComarchOptimaXml } from '@/lib/exports/comarch-optima-generator';
import {
  generateInsertSubiektCsv,
  generateSymfoniaCsv,
  generateUniversalCsv,
  generateWaproCsv,
} from '@/lib/exports/csv-generators';
import { counterpartyOf, type JpkInvoice } from '@/lib/exports/jpk-fa-generator';

/**
 * AUD-70 w eksportach dla programów księgowych:
 * - Comarch Optima: „np_ii” to w Optimie ta sama stawka „np” — brak klucza
 *   w mapie oznaczał po cichu 23%,
 * - CSV: nabywca z UE nie ma NIP-u — w kolumnie identyfikatora numer VAT-UE
 *   zamiast pustej komórki.
 */

const MY = { nip: '5260001246', name: 'Moja Firma', taxOfficeCode: '1433' };
const input = { issuer: MY, periodStart: '2026-09-01', periodEnd: '2026-09-30', receivedInvoices: [] };

function dlaUe(o: Partial<JpkInvoice> = {}): JpkInvoice {
  return {
    invoiceNumber: 'FV/2/09', currency: 'PLN', invoiceType: 'regular', issueDate: '2026-09-10',
    buyerName: 'Kunde GmbH', buyerVatUe: 'DE123456789', buyerAddress: 'Hauptstraße 1, 10115 Berlin',
    netTotal: 2000, vatTotal: 0, grossTotal: 2000,
    lines: [{ position: 1, name: 'Programowanie', unit: 'usł.', quantity: 1, unitPriceNet: 2000, netAmount: 2000, vatRate: 'np_ii', vatAmount: 0 }],
    ...o,
  };
}

describe('Comarch Optima: stawka „np_ii”', () => {
  it('StawkaVAT „np” (jak „np”), nie domyślne 23%; VAT 0', () => {
    const xml = generateComarchOptimaXml({ ...input, issuedInvoices: [dlaUe()] });
    expect(xml).toContain('<StawkaVAT>np</StawkaVAT>');
    expect(xml).not.toContain('<StawkaVAT>23%</StawkaVAT>');
    expect(xml).toContain('<WartoscVAT>0.00</WartoscVAT>');
  });
});

describe('kontrahent z UE w CSV', () => {
  it('counterpartyOf niesie numer VAT-UE nabywcy obok (pustego) NIP-u', () => {
    expect(counterpartyOf(dlaUe(), 'issued')).toMatchObject({ name: 'Kunde GmbH', nip: undefined, vatUe: 'DE123456789' });
  });

  it.each([
    ['uniwersalny', (d: Parameters<typeof generateUniversalCsv>[0]) => generateUniversalCsv(d).toString('utf8')],
    ['Symfonia', (d: Parameters<typeof generateSymfoniaCsv>[0]) => generateSymfoniaCsv(d).toString('utf8')],
    ['Wapro', (d: Parameters<typeof generateWaproCsv>[0]) => generateWaproCsv(d).toString('utf8')],
    ['Insert Subiekt', (d: Parameters<typeof generateInsertSubiektCsv>[0]) => iconv.decode(generateInsertSubiektCsv(d), 'win1250')],
  ])('%s: kolumna NIP = numer VAT-UE', (_opis, generuj) => {
    const wiersz = generuj({ ...input, issuedInvoices: [dlaUe()] }).split('\r\n').find((w) => w.includes('FV/2/09'));
    expect(wiersz).toContain('DE123456789');
  });

  it('nabywca z NIP-em — w kolumnie NIP, nie numer VAT-UE', () => {
    const csv = generateUniversalCsv({ ...input, issuedInvoices: [dlaUe({ buyerNip: '5252241585' })] }).toString('utf8');
    const wiersz = csv.split('\r\n').find((w) => w.includes('FV/2/09'));
    expect(wiersz).toContain('5252241585');
    expect(wiersz).not.toContain('DE123456789');
  });
});
