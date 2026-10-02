import { describe, expect, it } from 'vitest';

import { generateCorrectionInvoiceXml } from '@/lib/ksef/fa3-correction-generator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import type { CorrectionInvoiceData, InvoiceLine } from '@/types/invoice-types';

/**
 * AUD-03: korekta „przed/po” (typ domyślny) wysyłała do KSeF pełne wartości
 * PO korekcie zamiast różnicy — dokument zawyżał VAT i należność o całą
 * fakturę pierwotną. XSD FA(3) (`lib/xml/schemas/fa3/schemat.xsd`):
 *   - Fa: pola podstaw opodatkowania, podatku i należności ogółem
 *     „wypełnia się poprzez różnicę”,
 *   - P_13_x / P_14_x: „kwota różnicy, o której mowa w art. 106j ust. 2 pkt 5”,
 *   - P_15: „korekta kwoty wynikającej z faktury korygowanej”,
 *   - FaWiersz: różnice albo „dane pozycji korygowanych wg stanu przed korektą
 *     i po korekcie jako osobne wiersze”, wiersz „przed” ze znacznikiem
 *     `StanPrzed`, z odrębną numeracją.
 */

const line = (o: Partial<InvoiceLine> = {}): InvoiceLine => ({
  name: 'Usługa wdrożeniowa', unit: 'szt.', quantity: 10, unitPriceNet: 100, vatRate: '23', ...o,
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
    correctionReason: 'Zmiana ilości po reklamacji',
    typKorekty: '2',
    seller: { nip: '1234567890', name: 'Sprzedawca testowy', address: { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' } },
    buyer: { type: 'b2b', idType: 'nip', nip: '1234567890', name: 'Nabywca testowy', address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' } },
    linesBefore,
    linesAfter,
  } as CorrectionInvoiceData;
}

const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, 'g'))].map((m) => m[1]);
const rows = (xml: string) => [...xml.matchAll(/<FaWiersz>([\s\S]*?)<\/FaWiersz>/g)].map((m) => m[1]!);

describe('korekta przed/po — kwoty różnicy (AUD-03)', () => {
  const unchanged = line({ name: 'Abonament', quantity: 1, unitPriceNet: 50 });
  const xml = generateCorrectionInvoiceXml(
    correction([line(), unchanged], [line({ quantity: 8 }), unchanged]),
    { generatedAt: new Date('2026-10-02T10:00:00Z') },
  );

  it('P_13_1 / P_14_1 / P_15 to różnica, nie wartość po korekcie', () => {
    expect(tag(xml, 'P_13_1')).toEqual(['-200.00']);
    expect(tag(xml, 'P_14_1')).toEqual(['-46.00']);
    expect(tag(xml, 'P_15')).toEqual(['-246.00']);
  });

  it('tylko pozycje korygowane: wiersz „przed” ze StanPrzed i wiersz „po”, odrębna numeracja', () => {
    const r = rows(xml);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain('<NrWierszaFa>1</NrWierszaFa>');
    expect(r[0]).toContain('<P_8B>10.0000</P_8B>');
    expect(r[0]).toContain('<StanPrzed>1</StanPrzed>');
    expect(r[1]).toContain('<NrWierszaFa>2</NrWierszaFa>');
    expect(r[1]).toContain('<P_8B>8.0000</P_8B>');
    expect(r[1]).not.toContain('StanPrzed');
    expect(xml).not.toContain('Abonament');
  });

  it('przechodzi oficjalny XSD FA(3)', async () => {
    const wynik = await validateInvoiceXml(xml);
    expect(wynik.errors).toEqual([]);
    expect(wynik.valid).toBe(true);
  });
});

describe('korekta przed/po — zmiana stawki', () => {
  const xml = generateCorrectionInvoiceXml(
    correction([line({ quantity: 1, unitPriceNet: 100 })], [line({ quantity: 1, unitPriceNet: 100, vatRate: '8' })]),
    { generatedAt: new Date('2026-10-02T10:00:00Z') },
  );

  it('różnica rozkłada się na obie stawki, P_15 = różnica brutto', () => {
    expect(tag(xml, 'P_13_1')).toEqual(['-100.00']);
    expect(tag(xml, 'P_14_1')).toEqual(['-23.00']);
    expect(tag(xml, 'P_13_2')).toEqual(['100.00']);
    expect(tag(xml, 'P_14_2')).toEqual(['8.00']);
    expect(tag(xml, 'P_15')).toEqual(['-15.00']);
  });

  it('przechodzi oficjalny XSD FA(3)', async () => {
    expect((await validateInvoiceXml(xml)).valid).toBe(true);
  });
});

describe('korekta przed/po bez zmian w pozycjach', () => {
  it('odmawia — nie ma czego korygować kwotowo', () => {
    expect(() => generateCorrectionInvoiceXml(correction([line()], [line()]))).toThrow(/nie zmienia żadnej pozycji/);
  });
});

describe('korekta przed/po — zmiana opisu bez zmiany kwot', () => {
  const xml = generateCorrectionInvoiceXml(
    correction([line()], [line({ name: 'Usługa wdrożeniowa — etap I' })]),
    { generatedAt: new Date('2026-10-02T10:00:00Z') },
  );

  it('wiersze przed/po są, różnica zero, bez pól P_13', async () => {
    expect(rows(xml)).toHaveLength(2);
    expect(tag(xml, 'P_13_1')).toEqual([]);
    expect(tag(xml, 'P_15')).toEqual(['0.00']);
    const wynik = await validateInvoiceXml(xml);
    expect(wynik.errors).toEqual([]);
  });
});
