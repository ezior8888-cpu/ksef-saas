import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';

import {
  generateInsertSubiektCsv,
  generateSymfoniaCsv,
  generateUniversalCsv,
  generateWaproCsv,
  type CsvExportInput,
} from '@/lib/exports/csv-generators';
import type { JpkInvoice } from '@/lib/exports/jpk-fa-generator';

/**
 * AUD-60: CSV dla księgowej zawiera dane z faktur obcych podmiotów (nazwa
 * kontrahenta, numer faktury dostawcy). Komórka zaczynająca się od `=`, `+`,
 * `-`, `@` Excel wykonuje jak formułę. Takie teksty poprzedzamy apostrofem;
 * kwoty ujemne (korekty, np. „-200,00”) zostają liczbami.
 */

const wroga = '=HYPERLINK("http://example.test/x","Kliknij")';

function faktura(o: Partial<JpkInvoice> = {}): JpkInvoice {
  return {
    invoiceNumber: '+FV/1',
    invoiceType: 'correction',
    issueDate: '2026-09-20',
    buyerName: wroga,
    buyerNip: '1234567890',
    netTotal: -200,
    vatTotal: -46,
    grossTotal: -246,
    lines: [{ position: 1, name: '@SUM(A1)', unit: 'szt.', quantity: 1, unitPriceNet: -200, netAmount: -200, vatRate: '23' }],
    ...o,
  };
}

const dane: CsvExportInput = {
  issuer: { nip: '1234567890', name: 'Firma' },
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  issuedInvoices: [faktura()],
  receivedInvoices: [faktura({ invoiceNumber: '-2+3+cmd|x', sellerName: '-cmd', buyerName: 'Firma' } as Partial<JpkInvoice>)],
};

const outputs: Array<[string, () => string]> = [
  ['Subiekt', () => iconv.decode(generateInsertSubiektCsv(dane), 'win1250')],
  ['Symfonia', () => generateSymfoniaCsv(dane).toString('utf8')],
  ['Wapro', () => generateWaproCsv(dane).toString('utf8')],
  ['uniwersalny', () => generateUniversalCsv(dane).toString('utf8')],
];

describe.each(outputs)('CSV %s', (_name, render) => {
  const text = render();
  const cells = text.split(/\r\n/).flatMap((line) => line.split(/[;\t]/)).map((c) => c.replace(/^"|"$/g, ''));

  it('żadna komórka nie zaczyna się od znaku formuły (poza liczbami)', () => {
    const dangerous = cells.filter((c) => /^[=+@\t\r]/.test(c) || /^-(?![\d\s.,]*$)/.test(c));
    expect(dangerous).toEqual([]);
  });

  it('kwoty ujemne zostają liczbami', () => {
    expect(cells).toContain('-200,00');
  });
});
