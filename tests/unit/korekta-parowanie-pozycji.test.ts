import { describe, expect, it } from 'vitest';

import { generateCorrectionInvoiceXml } from '@/lib/ksef/fa3-correction-generator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import type { CorrectionInvoiceData, InvoiceLine } from '@/types/invoice-types';

/**
 * F-019 (audyt bloku 1): korekta „przed/po” parowała pozycje po kolejności.
 * Usunięcie środkowej z trzech pozycji dawało wiersze „B przed → C po,
 * C przed” — sumy się zgadzały, ale wiersze opisywały inną zmianę niż ta,
 * którą zrobił użytkownik. Pozycje bez zmian (także przesunięte) nie trafiają
 * do XML, zmienione parujemy po nazwie, a dopiero potem po kolejności.
 */

const line = (name: string, o: Partial<InvoiceLine> = {}): InvoiceLine => ({
  name, unit: 'szt.', quantity: 1, unitPriceNet: 100, vatRate: '23', ...o,
});

function correction(linesBefore: InvoiceLine[], linesAfter: InvoiceLine[]): CorrectionInvoiceData {
  return {
    invoiceType: 'correction',
    internalNumber: 'FK 1/10/2026',
    issueDate: '2026-10-02',
    paymentMethod: 'transfer',
    paymentDueDate: '2026-10-16',
    parentInvoiceId: '00000000-0000-4000-8000-000000000001',
    parentInvoiceNumber: 'FV 1/09/2026',
    parentInvoiceIssueDate: '2026-09-30',
    correctionType: 'before_after',
    correctionReason: 'Zmiana zamówienia',
    typKorekty: '2',
    seller: { nip: '1234567890', name: 'Sprzedawca testowy', address: { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' } },
    buyer: { type: 'b2b', idType: 'nip', nip: '1234567890', name: 'Nabywca testowy', address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' } },
    linesBefore,
    linesAfter,
  } as CorrectionInvoiceData;
}

const rows = (xml: string) => [...xml.matchAll(/<FaWiersz>([\s\S]*?)<\/FaWiersz>/g)].map((m) => m[1]!);
const name = (row: string) => /<P_7>([^<]*)<\/P_7>/.exec(row)?.[1];
const before = (row: string) => row.includes('<StanPrzed>1</StanPrzed>');
const tag = (xml: string, t: string) => [...xml.matchAll(new RegExp(`<${t}>([^<]*)</${t}>`, 'g'))].map((m) => m[1]);
const gen = (b: InvoiceLine[], a: InvoiceLine[]) =>
  generateCorrectionInvoiceXml(correction(b, a), { generatedAt: new Date('2026-10-02T10:00:00Z') });

describe('korekta przed/po — parowanie pozycji (F-019)', () => {
  it('usunięcie środkowej pozycji: tylko wiersz „przed” tej pozycji', async () => {
    const xml = gen([line('A'), line('B', { unitPriceNet: 200 }), line('C', { unitPriceNet: 300 })], [line('A'), line('C', { unitPriceNet: 300 })]);
    const r = rows(xml);
    expect(r.map((x) => [name(x), before(x)])).toEqual([['B', true]]);
    expect(tag(xml, 'P_13_1')).toEqual(['-200.00']);
    expect(tag(xml, 'P_15')).toEqual(['-246.00']);
    expect((await validateInvoiceXml(xml)).valid).toBe(true);
  });

  it('pozycja zmieniona i przesunięta: para po nazwie, pozycja bez zmian pominięta', () => {
    const xml = gen(
      [line('A'), line('B', { quantity: 10 })],
      [line('B', { quantity: 8 }), line('A')],
    );
    expect(rows(xml).map((x) => [name(x), before(x)])).toEqual([['B', true], ['B', false]]);
    expect(tag(xml, 'P_13_1')).toEqual(['-200.00']);
  });

  it('dodana pozycja: tylko wiersz „po”', () => {
    const xml = gen([line('A')], [line('A'), line('D', { unitPriceNet: 50 })]);
    expect(rows(xml).map((x) => [name(x), before(x)])).toEqual([['D', false]]);
    expect(tag(xml, 'P_13_1')).toEqual(['50.00']);
  });

  it('zmieniona nazwa (brak pary po nazwie): para po kolejności, jak dotąd', () => {
    const xml = gen([line('Stara nazwa')], [line('Nowa nazwa')]);
    expect(rows(xml).map((x) => [name(x), before(x)])).toEqual([['Stara nazwa', true], ['Nowa nazwa', false]]);
  });
});
