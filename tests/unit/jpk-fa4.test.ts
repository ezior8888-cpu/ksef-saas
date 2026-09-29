import { describe, expect, it } from 'vitest';

import { MissingIssuerAddressError, registeredAddressFrom } from '@/lib/exports/issuer-address';
import {
  generateJpkFa,
  JpkFaCorrectionNotSupportedError,
  type JpkFaInputData,
  type JpkInvoice,
} from '@/lib/exports/jpk-fa-generator';
import { validateJpkFa } from '@/lib/exports/jpk-fa-validator';
import { MissingTaxOfficeError } from '@/lib/exports/tax-office';

/**
 * JPK_FA(4) wg oficjalnego XSD MF (lib/exports/schemas/jpk-fa4/). Do 28.09
 * żaden plik nie przechodził schematu: brak P_16–P_23 i P_106E_2/3, jedno
 * P_13_1 na wszystkie stawki, elementy i atrybuty spoza wzoru, adres bez
 * województwa/powiatu/gminy, zła przestrzeń nazw typów wspólnych, zakupy
 * w pliku faktur wystawionych.
 */

const ADRES = {
  voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Mokotów', street: 'ul. Puławska',
  buildingNumber: '12', apartmentNumber: '3', city: 'Warszawa', postCode: '02-566',
};

function faktura(o: Partial<JpkInvoice> = {}): JpkInvoice {
  return {
    invoiceNumber: 'FV/1', invoiceType: 'regular', issueDate: '2026-09-10', buyerName: 'Klient Sp. z o.o.',
    buyerNip: '5252241585', buyerAddress: 'ul. Klienta 10, 02-001 Warszawa',
    netTotal: 1000, vatTotal: 230, grossTotal: 1230,
    lines: [{ position: 1, name: 'Usługa', unit: 'usł.', quantity: 1, unitPriceNet: 1000, netAmount: 1000, vatRate: '23', vatAmount: 230 }],
    ...o,
  };
}

const linia = (name: string, net: number, vatRate: string, vatAmount: number, quantity = 1) =>
  ({ position: 1, name, unit: 'szt.', quantity, unitPriceNet: net / quantity, netAmount: net, vatRate, vatAmount });

function dane(issuedInvoices: JpkInvoice[], o: Partial<JpkFaInputData['issuer']> = {}): JpkFaInputData {
  return {
    issuer: { nip: '5260001246', name: 'ACME sp. z o.o.', taxOfficeCode: '1433', registeredAddress: ADRES, ...o },
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    issuedInvoices,
    generatedAt: new Date('2026-10-01T08:00:00Z'),
  };
}

// Pełny przekrój: wiele stawek, zwolnienie, odwrotne obciążenie, poza krajem,
// 0%, zaliczka i faktura rozliczeniowa.
const WIELE_STAWEK = faktura({
  invoiceNumber: 'FV/1', netTotal: 1100, vatTotal: 238.01, grossTotal: 1338.01,
  lines: [linia('Projekt', 1000, '23', 230.01), linia('Książka', 100, '8', 8)],
  annotations: { cashMethod: true, splitPayment: true },
});
const ZWOLNIONA = faktura({
  invoiceNumber: 'FV/2', netTotal: 500, vatTotal: 0, grossTotal: 500,
  lines: [linia('Szkolenie', 500, 'zw', 0, 2.5)],
  annotations: { vatExemptionBasis: 'art. 113 ust. 1 ustawy o VAT' },
});
const RÓŻNE = faktura({
  invoiceNumber: 'FV/3', buyerNip: undefined, buyerName: '', buyerAddress: '', netTotal: 700, vatTotal: 0, grossTotal: 700,
  lines: [linia('Złom', 400, 'oo', 0), linia('Usługa w DE', 200, 'np', 0), linia('Eksport', 100, '0', 0)],
});
const ZALICZKA = faktura({
  invoiceNumber: 'ZAL/1', invoiceType: 'advance', netTotal: 1000, vatTotal: 230, grossTotal: 1230,
  lines: [linia('Zaliczka: strona WWW', 1000, '23', 230)],
});
const ROZ = faktura({
  invoiceNumber: 'ROZ/1', invoiceType: 'final', netTotal: 5000, vatTotal: 1150, grossTotal: 6150,
  lines: [linia('Strona WWW', 5000, '23', 1150)],
  advanceSettlement: [
    { internal_number: 'ZAL/1', advance_amount: 1230, issue_date: '2026-08-01', vat_rate: '23', net_amount: 1000, vat_amount: 230 },
    { internal_number: 'ZAL/2', advance_amount: 615, issue_date: '2026-08-15', vat_rate: '23' },
  ],
});
const PLIK = generateJpkFa(dane([WIELE_STAWEK, ZWOLNIONA, RÓŻNE, ZALICZKA, ROZ]));

/** Treść jednej faktury w pliku (od <P_2A>numer do końca jej elementu). */
function fakturaXml(numer: string): string {
  const start = PLIK.indexOf(`<P_2A>${numer}</P_2A>`);
  return PLIK.slice(start, PLIK.indexOf('</Faktura>', start));
}

describe('JPK_FA(4) — oficjalny XSD', () => {
  it('pełny plik przechodzi schemat MF', async () => {
    const wynik = await validateJpkFa(PLIK);
    expect(wynik.errors).toEqual([]);
    expect(wynik.valid).toBe(true);
  });

  it('walidator naprawdę odrzuca zły plik (brak obowiązkowego P_16)', async () => {
    const zly = PLIK.replace(/<P_16>(true|false)<\/P_16>/, '');
    expect((await validateJpkFa(zly)).valid).toBe(false);
  });

  it('bez elementów i atrybutów spoza wzoru; typy wspólne 2018/08/24', () => {
    for (const obcy of ['<Adnotacje>', '<NumerKSeF>', '<NazwaSystemu>', ' typ="', ' rola="', ' poz="']) {
      expect(PLIK).not.toContain(obcy);
    }
    expect(PLIK).toContain('xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2018/08/24/eD/DefinicjeTypy/"');
    expect(PLIK).toContain('<CelZlozenia>1</CelZlozenia>');
  });
});

describe('Podmiot1 — adres z rejestru (województwo, powiat, gmina)', () => {
  it('adres w typach wspólnych MF', () => {
    expect(PLIK).toMatch(
      /<AdresPodmiotu>\s*<etd:KodKraju>PL<\/etd:KodKraju>\s*<etd:Wojewodztwo>MAZOWIECKIE<\/etd:Wojewodztwo>\s*<etd:Powiat>Warszawa<\/etd:Powiat>\s*<etd:Gmina>Mokotów<\/etd:Gmina>/,
    );
    expect(PLIK).toContain('<etd:NrDomu>12</etd:NrDomu>');
    expect(PLIK).toContain('<etd:NrLokalu>3</etd:NrLokalu>');
  });

  it('bez urzędu — najpierw błąd urzędu (ustawia go człowiek), potem adres', () => {
    expect(() => generateJpkFa(dane([faktura()], { taxOfficeCode: undefined, registeredAddress: undefined }))).toThrow(
      MissingTaxOfficeError,
    );
    expect(() => generateJpkFa(dane([faktura()], { registeredAddress: undefined }))).toThrow(MissingIssuerAddressError);
  });
});

describe('kwoty w stawkach', () => {
  it('23% i 8% w osobnych polach; P_14 z VAT pozycji (co do grosza)', () => {
    const f = fakturaXml('FV/1');
    expect(f).toContain('<P_13_1>1000.00</P_13_1>');
    expect(f).toContain('<P_14_1>230.01</P_14_1>');
    expect(f).toContain('<P_13_2>100.00</P_13_2>');
    expect(f).toContain('<P_14_2>8.00</P_14_2>');
    expect(f).toContain('<P_15>1338.01</P_15>');
  });

  it('oo → P_13_4 z P_14_4 = 0; np → P_13_5 bez P_14_5; 0% → P_13_6; zw → P_13_7', () => {
    const f = fakturaXml('FV/3');
    expect(f).toContain('<P_13_4>400.00</P_13_4>');
    expect(f).toContain('<P_14_4>0.00</P_14_4>');
    expect(f).toContain('<P_13_5>200.00</P_13_5>');
    expect(f).not.toContain('<P_14_5>');
    expect(f).toContain('<P_13_6>100.00</P_13_6>');
    expect(fakturaXml('FV/2')).toContain('<P_13_7>500.00</P_13_7>');
  });

  it('nabywca bez NIP-u i nazwy: bez pustych P_5B i P_3A (schemat nie dopuszcza pustych)', () => {
    const f = fakturaXml('FV/3');
    expect(f).not.toContain('<P_5B>');
    expect(f).not.toContain('<P_3A>');
    expect(f).toContain('<P_3C>ACME sp. z o.o.</P_3C>');
    expect(f).toContain('<P_4B>5260001246</P_4B>');
  });

  it('stawka spoza JPK_FA(4) — błąd, nie ciche 23%', () => {
    expect(() => generateJpkFa(dane([faktura({ lines: [linia('X', 10, '7', 0.7)] })]))).toThrow(/stawka "7"/);
  });
});

describe('adnotacje P_16–P_23', () => {
  it('metoda kasowa → P_16, MPP → P_18A', () => {
    const f = fakturaXml('FV/1');
    expect(f).toContain('<P_16>true</P_16>');
    expect(f).toContain('<P_18A>true</P_18A>');
    expect(f).toContain('<P_18>false</P_18>');
    expect(f).toContain('<P_19>false</P_19>');
  });

  it('zwolnienie → P_19 i podstawa w P_19A', () => {
    const f = fakturaXml('FV/2');
    expect(f).toContain('<P_19>true</P_19>');
    expect(f).toContain('<P_19A>art. 113 ust. 1 ustawy o VAT</P_19A>');
    expect(f).toContain('<P_16>false</P_16>');
  });

  it('odwrotne obciążenie → P_18', () => {
    expect(fakturaXml('FV/3')).toContain('<P_18>true</P_18>');
  });
});

describe('zaliczka i faktura rozliczeniowa', () => {
  it('ZAL: RodzajFaktury ZAL, kwota zaliczki', () => {
    const f = fakturaXml('ZAL/1');
    expect(f).toContain('<RodzajFaktury>ZAL</RodzajFaktury>');
    expect(f).toContain('<P_15>1230.00</P_15>');
  });

  it('ROZ: VAT z numerami zaliczek; P_13/P_14/P_15 po odjęciu zaliczek (art. 106f ust. 3)', () => {
    const f = fakturaXml('ROZ/1');
    expect(f).toContain('<RodzajFaktury>VAT</RodzajFaktury>');
    expect(f).toContain('<NrFaZaliczkowej>ZAL/1, ZAL/2</NrFaZaliczkowej>');
    // 5000 − 1000 − 500 (ZAL/2 bez rozbicia: 615 / 1,23); VAT 1150 − 230 − 115
    expect(f).toContain('<P_13_1>3500.00</P_13_1>');
    expect(f).toContain('<P_14_1>805.00</P_14_1>');
    expect(f).toContain('<P_15>4305.00</P_15>');
  });

  it('ROZ: pozycje pełne (FaWiersz — wartości zamówienia)', () => {
    expect(PLIK).toMatch(/<P_2B>ROZ\/1<\/P_2B>[\s\S]*?<P_11>5000.00<\/P_11>/);
  });

  it('korekta — odmowa zamiast złych kwot (C-01)', () => {
    expect(() => generateJpkFa(dane([faktura(), faktura({ invoiceNumber: 'KOR/1', invoiceType: 'correction' })]))).toThrow(
      JpkFaCorrectionNotSupportedError,
    );
  });
});

describe('sumy kontrolne', () => {
  it('FakturaCtrl: liczba faktur i suma P_15 (ROZ resztą)', () => {
    // 1338.01 + 500 + 700 + 1230 + 4305
    expect(PLIK).toMatch(/<FakturaCtrl>\s*<LiczbaFaktur>5<\/LiczbaFaktur>\s*<WartoscFaktur>8073.01<\/WartoscFaktur>/);
  });

  it('FakturaWierszCtrl: liczba pozycji i suma P_11', () => {
    // 1000 + 100 + 500 + 400 + 200 + 100 + 1000 + 5000
    expect(PLIK).toMatch(
      /<FakturaWierszCtrl>\s*<LiczbaWierszyFaktur>8<\/LiczbaWierszyFaktur>\s*<WartoscWierszyFaktur>8300.00<\/WartoscWierszyFaktur>/,
    );
  });

  it('ilość z częścią ułamkową i cena jednostkowa do 2 miejsc', () => {
    expect(PLIK).toMatch(/<P_2B>FV\/2<\/P_2B>[\s\S]*?<P_8B>2.5<\/P_8B>\s*<P_9A>200.00<\/P_9A>/);
  });

  it('długi tekst przycięty do 256 znaków (TZnakowyJPK)', async () => {
    const plik = generateJpkFa(dane([faktura({ lines: [linia('x'.repeat(400), 1000, '23', 230)] })]));
    expect(plik).toContain(`<P_7>${'x'.repeat(256)}</P_7>`);
    expect((await validateJpkFa(plik)).valid).toBe(true);
  });
});

describe('adres z GUS', () => {
  const znaleziona = {
    kind: 'found' as const,
    data: {
      nip: '5260001246', regon: '1', name: 'ACME', postalCode: '02-566', city: 'Warszawa', street: 'ul. Puławska',
      buildingNumber: 12 as unknown as string, localNumber: '3', voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Mokotów',
    },
  };

  it('pełny rekord → adres (numer z parsera XML jako liczba → tekst)', () => {
    expect(registeredAddressFrom(znaleziona)).toEqual({ ...ADRES });
  });

  it.each(['voivodeship', 'county', 'commune', 'buildingNumber', 'city', 'postalCode'] as const)(
    'brak pola %s → null (plik byłby niezgodny)',
    (pole) => {
      expect(registeredAddressFrom({ ...znaleziona, data: { ...znaleziona.data, [pole]: '' } })).toBeNull();
    },
  );

  it('GUS nie zna firmy → null; błąd GUS → wyjątek (job ponowi)', () => {
    expect(registeredAddressFrom({ kind: 'not-found' })).toBeNull();
    expect(() => registeredAddressFrom({ kind: 'error', message: 'timeout' })).toThrow(/GUS: timeout/);
  });
});
