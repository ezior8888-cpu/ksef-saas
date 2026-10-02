import { describe, expect, it } from 'vitest';

import type { JpkInvoice } from '@/lib/exports/jpk-fa-generator';
import { generateJpkV7m, summarizeJpkV7m, type JpkV7mInputData } from '@/lib/exports/jpk-v7m-generator';
import { validateJpkV7m } from '@/lib/exports/jpk-v7m-validator';

/**
 * Faktura rozliczeniowa (ROZ) w JPK_V7M. Pozycje ROZ to PEŁNE zamówienie,
 * a VAT od zaliczek jest już w ewidencji z faktur zaliczkowych. Na ROZ
 * w KSeF są kwoty po odjęciu zaliczek (art. 106f ust. 3, #84) i tylko te
 * mają trafić do ewidencji i deklaracji. Do 01.10.2026 JPK_V7M sumował
 * pozycje ROZ w całości: VAT zaliczek był należny dwa razy.
 *
 * Zamówienie 10 000 netto (23%), zaliczka 2 000 + 460 VAT.
 */

const zaliczka = { internal_number: 'FZ/1/09', ksef_number: null, issue_date: '2026-09-05', advance_amount: 2460, vat_rate: '23', net_amount: 2000, vat_amount: 460 };
const linia = (netAmount: number, vatRate: string, vatAmount?: number) => ({ position: 1, name: 'x', unit: 'szt.', quantity: 1, unitPriceNet: netAmount, netAmount, vatRate, vatAmount });

function faktura(o: Partial<JpkInvoice>): JpkInvoice {
  return {
    invoiceNumber: 'FV/1/09',
    currency: 'PLN',
    invoiceType: 'regular',
    issueDate: '2026-09-20',
    buyerName: 'Klient Sp. z o.o.',
    buyerNip: '5252241585',
    netTotal: 10_000,
    vatTotal: 2_300,
    grossTotal: 12_300,
    ksefNumber: '5260001246-20260920-0100001AF629-AF',
    lines: [linia(10_000, '23')],
    ...o,
  };
}

const zal = faktura({ invoiceNumber: 'FZ/1/09', invoiceType: 'advance', issueDate: '2026-09-05', netTotal: 2000, vatTotal: 460, grossTotal: 2460, lines: [linia(2000, '23', 460)] });
const roz = faktura({ invoiceNumber: 'FR/1/09', invoiceType: 'final', advanceSettlement: [zaliczka] });

function dane(issuedInvoices: JpkInvoice[]): JpkV7mInputData {
  return {
    issuer: { nip: '5260001246', name: 'Moja Firma Sp. z o.o.', email: 'biuro@example.test', taxOfficeCode: '1433' },
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    generatedAt: new Date('2026-10-01T10:00:00Z'),
    issuedInvoices,
  };
}

/** Pola wiersza sprzedaży o danym numerze dowodu (bez wyrażeń regularnych z danych). */
function wiersz(xml: string, nr: string): string {
  const w = xml
    .split('<SprzedazWiersz>')
    .slice(1)
    .map((s) => s.split('</SprzedazWiersz>')[0]!)
    .find((s) => s.includes(`<DowodSprzedazy>${nr}</DowodSprzedazy>`));
  if (w === undefined) throw new Error(`brak wiersza ${nr}`);
  return w;
}

describe('JPK_V7M: ROZ po odjęciu zaliczek', () => {
  it('wiersz ROZ: K_19/K_20 = zamówienie minus zaliczka', () => {
    const w = wiersz(generateJpkV7m(dane([roz])), 'FR/1/09');
    expect(w).toContain('<K_19>8000.00</K_19>');
    expect(w).toContain('<K_20>1840.00</K_20>');
  });

  it('ZAL i ROZ w jednym miesiącu: VAT całego zamówienia raz, nie 2 760', () => {
    const xml = generateJpkV7m(dane([zal, roz]));
    expect(xml).toContain('<P_19>10000</P_19>');
    expect(xml).toContain('<P_20>2300</P_20>');
    expect(xml).toContain('<PodatekNalezny>2300.00</PodatekNalezny>');
    expect(summarizeJpkV7m(dane([zal, roz])).vatDue).toBe(2300);
  });

  it('dwie zaliczki w dwóch stawkach — każda pomniejsza swoją stawkę', () => {
    const r = faktura({
      invoiceNumber: 'FR/2/09',
      invoiceType: 'final',
      netTotal: 1100,
      vatTotal: 238,
      grossTotal: 1338,
      lines: [linia(1000, '23'), { ...linia(100, '8'), position: 2 }],
      advanceSettlement: [
        { ...zaliczka, advance_amount: 123, net_amount: 100, vat_amount: 23 },
        { ...zaliczka, internal_number: 'FZ/2/09', advance_amount: 54, vat_rate: '8', net_amount: 50, vat_amount: 4 },
      ],
    });
    const w = wiersz(generateJpkV7m(dane([r])), 'FR/2/09');
    expect(w).toContain('<K_17>50.00</K_17>');
    expect(w).toContain('<K_18>4.00</K_18>');
    expect(w).toContain('<K_19>900.00</K_19>');
    expect(w).toContain('<K_20>207.00</K_20>');
  });

  it('VAT pozycji z faktury, nie przeliczany z netto', () => {
    // Faktura liczona od brutto: 0,13 zł brutto → netto 0,11, VAT 0,02
    // (a 0,11 × 23% = 0,0253, czyli 0,03). W ewidencji ma być to, co na fakturze.
    const f = faktura({ invoiceNumber: 'FV/2/09', netTotal: 0.11, vatTotal: 0.02, grossTotal: 0.13, lines: [linia(0.11, '23', 0.02)] });
    expect(wiersz(generateJpkV7m(dane([f])), 'FV/2/09')).toContain('<K_20>0.02</K_20>');
  });

  it('plik z ZAL i ROZ przechodzi XSD', async () => {
    expect((await validateJpkV7m(generateJpkV7m(dane([zal, roz])))).errors).toEqual([]);
  });
});
