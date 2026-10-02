import { describe, expect, it } from 'vitest';

import { generateJpkFa, type JpkFaInputData, type JpkInvoice } from '@/lib/exports/jpk-fa-generator';
import { validateJpkFa } from '@/lib/exports/jpk-fa-validator';
import { generateJpkV7m, summarizeJpkV7m, type JpkV7mInputData } from '@/lib/exports/jpk-v7m-generator';
import { validateJpkV7m } from '@/lib/exports/jpk-v7m-validator';

/**
 * AUD-70: stawka „np_ii” (usługi z art. 100 ust. 1 pkt 4 — art. 28b, nabywca
 * z innego państwa UE rozlicza VAT) i nabywca z numerem VAT-UE w plikach JPK.
 *
 * JPK_FA(4) (lib/exports/schemas/jpk-fa4/schemat.xsd):
 * - P_12 pozycji zna tylko `np` (maxLength 2) — „np_ii” idzie jako `np`,
 * - netto w P_13_5 („poza terytorium kraju”) razem z „np”, bez P_14_5,
 * - P_18 = true (wyrazy „odwrotne obciążenie” — opis jak w FA(3)),
 * - nabywca z UE: P_5A (TKodyKrajowUE, Grecja `EL`) + P_5B (numer bez prefiksu).
 *
 * JPK_V7M(3) (lib/exports/schemas/jpk-v7m3/schemat.xsd):
 * - K_11/P_11 „poza terytorium kraju” obejmuje też usługi z art. 100 ust. 1
 *   pkt 4, a K_12/P_12 to ich część („w tym”) — P_12 stoi w sekwencji za
 *   obowiązkowym P_11, a P_37 sumuje P_11 bez P_12,
 * - KodKrajuNadaniaTIN (TKodKrajuJPK: słownik krajów + `EL`, bez `GR`)
 *   + NrKontrahenta bez prefiksu kraju.
 */

const ADRES = {
  voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Mokotów', street: 'ul. Puławska',
  buildingNumber: '12', city: 'Warszawa', postCode: '02-566',
};

function linia(name: string, net: number, vatRate: string, vatAmount = 0) {
  return { position: 1, name, unit: 'usł.', quantity: 1, unitPriceNet: net, netAmount: net, vatRate, vatAmount };
}

function faktura(o: Partial<JpkInvoice> = {}): JpkInvoice {
  return {
    invoiceNumber: 'FV/1/09', currency: 'PLN', invoiceType: 'regular', issueDate: '2026-09-10',
    buyerName: 'Klient Sp. z o.o.', buyerNip: '5252241585', buyerAddress: 'ul. Klienta 10, 02-001 Warszawa',
    netTotal: 1000, vatTotal: 230, grossTotal: 1230,
    ksefNumber: '5260001246-20260910-0100001AF629-AF',
    lines: [linia('Usługa', 1000, '23', 230)],
    ...o,
  };
}

/** Faktura dla firmy z UE tak, jak zapisuje ją aplikacja: bez NIP-u, z numerem VAT-UE. */
function dlaUe(o: Partial<JpkInvoice> = {}): JpkInvoice {
  return faktura({
    invoiceNumber: 'FV/2/09', buyerNip: undefined, buyerVatUe: 'DE123456789', buyerName: 'Kunde GmbH',
    buyerAddress: 'Hauptstraße 1, 10115 Berlin', netTotal: 2000, vatTotal: 0, grossTotal: 2000,
    lines: [linia('Programowanie', 2000, 'np_ii')],
    ...o,
  });
}

function daneFa(issuedInvoices: JpkInvoice[]): JpkFaInputData {
  return {
    issuer: { nip: '5260001246', name: 'ACME sp. z o.o.', taxOfficeCode: '1433', registeredAddress: ADRES },
    periodStart: '2026-09-01', periodEnd: '2026-09-30', issuedInvoices,
    generatedAt: new Date('2026-10-01T08:00:00Z'),
  };
}

function daneV7m(issuedInvoices: JpkInvoice[]): JpkV7mInputData {
  return {
    issuer: { nip: '5260001246', name: 'Moja Firma', email: 'biuro@example.test', taxOfficeCode: '1433' },
    periodStart: '2026-09-01', periodEnd: '2026-09-30', issuedInvoices,
    generatedAt: new Date('2026-10-01T10:00:00Z'),
  };
}

/** Fragment pliku od elementu z numerem faktury do końca jej elementu. */
function fragment(xml: string, start: string, end: string): string {
  const i = xml.indexOf(start);
  expect(i).toBeGreaterThanOrEqual(0);
  return xml.slice(i, xml.indexOf(end, i));
}

describe('JPK_FA(4): „np_ii” i nabywca z UE', () => {
  const PLIK = generateJpkFa(daneFa([faktura(), dlaUe()]));
  const f = fragment(PLIK, '<P_2A>FV/2/09</P_2A>', '</Faktura>');

  it('plik przechodzi XSD MF', async () => {
    expect((await validateJpkFa(PLIK)).errors).toEqual([]);
  });

  it('netto w P_13_5 jak „np”, bez P_14_5; P_18 = true (odwrotne obciążenie)', () => {
    expect(f).toContain('<P_13_5>2000.00</P_13_5>');
    expect(f).not.toContain('<P_14_5>');
    expect(f).toContain('<P_18>true</P_18>');
    expect(f).toContain('<P_15>2000.00</P_15>');
  });

  it('pozycja: P_12 = „np” — enum JPK_FA(4) nie zna „np II”', () => {
    const w = fragment(PLIK, '<P_2B>FV/2/09</P_2B>', '</FakturaWiersz>');
    expect(w).toContain('<P_12>np</P_12>');
    expect(PLIK).not.toContain('np_ii');
  });

  it('nabywca z UE: P_5A = kod kraju, P_5B = numer bez prefiksu (w tej kolejności)', () => {
    expect(f).toMatch(/<P_4B>5260001246<\/P_4B>\s*<P_5A>DE<\/P_5A>\s*<P_5B>123456789<\/P_5B>/);
  });

  it('Grecja: P_5A = EL (TKodyKrajowUE), plik przechodzi XSD', async () => {
    const plik = generateJpkFa(daneFa([dlaUe({ buyerVatUe: 'EL094259216' })]));
    expect(plik).toContain('<P_5A>EL</P_5A>');
    expect(plik).toContain('<P_5B>094259216</P_5B>');
    expect((await validateJpkFa(plik)).errors).toEqual([]);
  });

  it('„np” i „np_ii” na jednej fakturze: jedno P_13_5 z sumą (schemat nie dopuszcza dwóch)', async () => {
    const plik = generateJpkFa(daneFa([dlaUe({
      netTotal: 2500, grossTotal: 2500, lines: [linia('Montaż w DE', 500, 'np'), linia('Programowanie', 2000, 'np_ii')],
    })]));
    expect(plik.match(/<P_13_5>/g)).toHaveLength(1);
    expect(plik).toContain('<P_13_5>2500.00</P_13_5>');
    expect(plik).toContain('<P_18>true</P_18>');
    expect((await validateJpkFa(plik)).errors).toEqual([]);
  });

  it('sama „np” (np I) — P_18 zostaje false', () => {
    const plik = generateJpkFa(daneFa([dlaUe({ lines: [linia('Montaż w DE', 2000, 'np')] })]));
    expect(plik).toContain('<P_18>false</P_18>');
  });

  it('nabywca z NIP-em — P_5B to NIP, bez P_5A', () => {
    const k = fragment(PLIK, '<P_2A>FV/1/09</P_2A>', '</Faktura>');
    expect(k).toContain('<P_5B>5252241585</P_5B>');
    expect(k).not.toContain('<P_5A>');
  });

  it('numer VAT-UE spoza listy krajów UE — bez P_5A/P_5B zamiast pliku niezgodnego ze schematem', async () => {
    const plik = generateJpkFa(daneFa([dlaUe({ buyerVatUe: 'XX123' })]));
    expect(plik).not.toContain('<P_5A>');
    expect(plik).not.toContain('<P_5B>');
    expect((await validateJpkFa(plik)).errors).toEqual([]);
  });
});

describe('JPK_V7M(3): „np_ii” i nabywca z UE', () => {
  const PLIK = generateJpkV7m(daneV7m([faktura(), dlaUe()]));
  const wiersz = fragment(PLIK, '<DowodSprzedazy>FV/2/09</DowodSprzedazy>', '</SprzedazWiersz>');

  it('plik przechodzi XSD MF', async () => {
    expect((await validateJpkV7m(PLIK)).errors).toEqual([]);
  });

  it('wiersz: K_11 i K_12 („w tym” art. 100 ust. 1 pkt 4)', () => {
    expect(wiersz).toContain('<K_11>2000.00</K_11>');
    expect(wiersz).toContain('<K_12>2000.00</K_12>');
  });

  it('deklaracja: P_11 i P_12; P_37 liczy P_11 bez P_12; bez podatku należnego', () => {
    expect(PLIK).toContain('<P_11>2000</P_11>');
    expect(PLIK).toContain('<P_12>2000</P_12>');
    // 1000 (23%) + 2000 (P_11) — P_12 to część P_11, nie osobna podstawa.
    expect(PLIK).toContain('<P_37>3000</P_37>');
    expect(PLIK).toContain('<P_38>230</P_38>');
  });

  it('kontrahent z UE: KodKrajuNadaniaTIN + NrKontrahenta bez prefiksu', () => {
    const s = fragment(PLIK, '<LpSprzedazy>2</LpSprzedazy>', '</SprzedazWiersz>');
    expect(s).toMatch(
      /<LpSprzedazy>2<\/LpSprzedazy>\s*<KodKrajuNadaniaTIN>DE<\/KodKrajuNadaniaTIN>\s*<NrKontrahenta>123456789<\/NrKontrahenta>/,
    );
  });

  it('kontrahent z NIP-em — bez KodKrajuNadaniaTIN', () => {
    const s = fragment(PLIK, '<LpSprzedazy>1</LpSprzedazy>', '</SprzedazWiersz>');
    expect(s).toContain('<NrKontrahenta>5252241585</NrKontrahenta>');
    expect(s).not.toContain('<KodKrajuNadaniaTIN>');
  });

  it('Grecja: KodKrajuNadaniaTIN = EL — schemat wyklucza GR', async () => {
    const plik = generateJpkV7m(daneV7m([dlaUe({ buyerVatUe: 'EL094259216' })]));
    expect(plik).toContain('<KodKrajuNadaniaTIN>EL</KodKrajuNadaniaTIN>');
    expect(plik).toContain('<NrKontrahenta>094259216</NrKontrahenta>');
    expect((await validateJpkV7m(plik)).errors).toEqual([]);
    // Sprawdzenie faktu ze schematu, na którym stoi mapowanie.
    const zGR = plik.replace('<KodKrajuNadaniaTIN>EL<', '<KodKrajuNadaniaTIN>GR<');
    expect((await validateJpkV7m(zGR)).valid).toBe(false);
  });

  it('„np” i „np_ii”: K_11/P_11 z sumą, K_12/P_12 tylko z „np_ii”', async () => {
    const plik = generateJpkV7m(daneV7m([dlaUe({
      netTotal: 2500.6, grossTotal: 2500.6, lines: [linia('Montaż w DE', 500.6, 'np'), linia('Programowanie', 2000, 'np_ii')],
    })]));
    expect(plik).toContain('<K_11>2500.60</K_11>');
    expect(plik).toContain('<K_12>2000.00</K_12>');
    expect(plik).toContain('<P_11>2501</P_11>');
    expect(plik).toContain('<P_12>2000</P_12>');
    expect(plik).toContain('<P_37>2501</P_37>');
    expect((await validateJpkV7m(plik)).errors).toEqual([]);
  });

  it('sama „np” — bez K_12 i P_12', () => {
    const plik = generateJpkV7m(daneV7m([dlaUe({ lines: [linia('Montaż w DE', 2000, 'np')] })]));
    expect(plik).toContain('<K_11>2000.00</K_11>');
    expect(plik).not.toContain('<K_12>');
    expect(plik).not.toContain('<P_12>');
  });

  it('podsumowanie dla FLO: „np_ii” bez podatku należnego, bez odmowy', () => {
    expect(summarizeJpkV7m(daneV7m([faktura(), dlaUe()]))).toMatchObject({ vatDue: 230, salesCount: 2 });
  });
});
