import { describe, expect, it } from 'vitest';

import { generateCorrectionInvoiceXml } from '@/lib/ksef/fa3-correction-generator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import { NP_II_NOT_FOR_XI_MESSAGE, NP_II_CORRECTION_BUYER_MESSAGE } from '@/lib/schemas/invoice-form';
import type {
  BuyerB2B,
  BuyerB2C,
  BuyerEU,
  CorrectionInvoiceData,
  InvoiceLine,
} from '@/types/invoice-types';

/**
 * AUD-70 KOR: faktura korygująca fakturę dla firmy z innego państwa UE.
 *
 * XSD FA(3): `Podmiot2/DaneIdentyfikacyjne` = KodUE (`TKodyKrajowUE`, Grecja
 * „EL”) + NrVatUE (`TNrVatUE`, bez prefiksu) + Nazwa; `Adres/KodKraju` to kod
 * ISO (`TKodKraju`, Grecja „GR” — „EL” nie istnieje na tej liście). „np II”
 * (art. 100 ust. 1 pkt 4) → P_12 „np II”, różnica w P_13_9 bez P_14, P_18=1.
 */

const SELLER = {
  nip: '1234567890',
  name: 'Sprzedawca testowy',
  address: { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' },
};

const NABYWCA_DE: BuyerEU = {
  type: 'eu',
  vatUeNumber: 'DE123456789',
  name: 'Kunde GmbH',
  address: { countryCode: 'DE', addressLine1: 'Hauptstrasse 1', addressLine2: '10115 Berlin' },
};

const NABYWCA_EL: BuyerEU = {
  type: 'eu',
  vatUeNumber: 'EL123456789',
  name: 'Pelatis A.E.',
  address: { countryCode: 'GR', addressLine1: 'Odos Ermou 1', addressLine2: '10563 Athina' },
};

const NABYWCA_XI: BuyerEU = {
  type: 'eu',
  vatUeNumber: 'XI123456789',
  name: 'Customer Ltd',
  address: { countryCode: 'XI', addressLine1: '1 Test Street', addressLine2: 'BT1 1AA Belfast' },
};

const NABYWCA_NIP: BuyerB2B = {
  type: 'b2b',
  idType: 'nip',
  nip: '1234567890',
  name: 'Nabywca testowy',
  address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' },
};

const NABYWCA_B2C: BuyerB2C = {
  type: 'b2c',
  idType: 'no_id',
  name: 'Konsument',
  address: { countryCode: 'PL', addressLine1: 'ul. Domowa 5', addressLine2: '00-003 Warszawa' },
};

const pozycja = (vatRate: InvoiceLine['vatRate'], unitPriceNet = 1000, name = 'Usługa programistyczna'): InvoiceLine => ({
  name,
  unit: 'usł.',
  quantity: 1,
  unitPriceNet,
  vatRate,
});

const korekta = (o: Partial<CorrectionInvoiceData> = {}): CorrectionInvoiceData => ({
  invoiceType: 'correction',
  internalNumber: 'FK 1/10/2026',
  issueDate: '2026-10-02',
  paymentMethod: 'transfer',
  paymentDueDate: '2026-10-16',
  bankAccount: 'PL61109010140000071219812874',
  parentInvoiceId: '00000000-0000-4000-8000-000000000001',
  parentInvoiceNumber: 'FV 1/09/2026',
  parentInvoiceIssueDate: '2026-09-26',
  parentKsefNumber: '1234567890-20260926-ABCDEF123456-01',
  correctionType: 'before_after',
  correctionReason: 'Zmiana ceny usługi',
  typKorekty: '2',
  seller: SELLER,
  buyer: NABYWCA_DE,
  linesBefore: [pozycja('np_ii', 1000)],
  linesAfter: [pozycja('np_ii', 900)],
  ...o,
});

const xmlOf = (data: CorrectionInvoiceData) => generateCorrectionInvoiceXml(data, { prettyPrint: false });

async function expectXsdValid(xml: string): Promise<void> {
  const wynik = await validateInvoiceXml(xml);
  expect(wynik.errors).toEqual([]);
  expect(wynik.valid).toBe(true);
}

describe('KOR — nabywca z UE (KodUE + NrVatUE), AUD-70', () => {
  it('przed/po np II, nabywca z DE: Podmiot2 KodUE+NrVatUE, adres DE, P_13_9 różnicy, P_18=1 — zgodna z XSD', async () => {
    const xml = xmlOf(korekta());
    expect(xml).toContain(
      '<Podmiot2><DaneIdentyfikacyjne><KodUE>DE</KodUE><NrVatUE>123456789</NrVatUE><Nazwa>Kunde GmbH</Nazwa></DaneIdentyfikacyjne>' +
        '<Adres><KodKraju>DE</KodKraju><AdresL1>Hauptstrasse 1</AdresL1><AdresL2>10115 Berlin</AdresL2></Adres>' +
        '<JST>2</JST><GV>2</GV></Podmiot2>',
    );
    expect(xml).not.toContain('<NIP>1234567890</NIP><Nazwa>Kunde');
    expect(xml).toContain('<P_13_9>-100.00</P_13_9>');
    expect(xml).not.toMatch(/<P_14_/);
    expect(xml).toContain('<P_15>-100.00</P_15>');
    expect(xml).toContain('<P_18>1</P_18>');
    // Wiersz „przed” ze StanPrzed i wiersz „po” — oba „np II”.
    expect(xml.match(/<P_12>np II<\/P_12>/g)).toHaveLength(2);
    expect(xml).toContain('<P_12>np II</P_12><StanPrzed>1</StanPrzed>');
    await expectXsdValid(xml);
  });

  it('przed/po mieszana: 23% i np II zmienione — P_13_1/P_14_1 i P_13_9, P_15 = różnica brutto', async () => {
    const xml = xmlOf(
      korekta({
        linesBefore: [pozycja('23', 100, 'Licencja'), pozycja('np_ii', 1000)],
        linesAfter: [pozycja('23', 200, 'Licencja'), pozycja('np_ii', 800)],
      }),
    );
    expect(xml).toContain('<P_13_1>100.00</P_13_1><P_14_1>23.00</P_14_1>');
    expect(xml).toContain('<P_13_9>-200.00</P_13_9>');
    expect(xml).toContain('<P_15>-77.00</P_15>');
    expect(xml).toContain('<P_18>1</P_18>');
    await expectXsdValid(xml);
  });

  it('kwotowa np II (stawka z faktury pierwotnej): P_12 „np II”, P_13_9, bez P_14, P_18=1 — zgodna z XSD', async () => {
    const xml = xmlOf(
      korekta({
        correctionType: 'amount_change',
        linesBefore: undefined,
        linesAfter: undefined,
        amountChange: { netDelta: -250, vatDelta: 0, grossDelta: -250, description: 'Rabat posprzedażowy', vatRate: 'np_ii' },
      }),
    );
    expect(xml).toContain('<P_13_9>-250.00</P_13_9>');
    expect(xml).not.toMatch(/<P_14_/);
    expect(xml).not.toContain('<P_13_6_1>');
    expect(xml).toContain('<P_15>-250.00</P_15>');
    expect(xml).toContain('<P_12>np II</P_12>');
    expect(xml).toContain('<P_18>1</P_18>');
    await expectXsdValid(xml);
  });

  it('anulująca fakturę np II: P_13_9 ujemne, P_18=1 — zgodna z XSD', async () => {
    const xml = xmlOf(korekta({ correctionType: 'cancellation', linesAfter: undefined }));
    expect(xml).toContain('<P_13_9>-1000.00</P_13_9>');
    expect(xml).toContain('<P_15>-1000.00</P_15>');
    expect(xml).toContain('<P_18>1</P_18>');
    await expectXsdValid(xml);
  });

  it('Grecja: KodUE „EL”, a Adres/KodKraju „GR” — zgodna z XSD', async () => {
    const xml = xmlOf(korekta({ buyer: NABYWCA_EL }));
    expect(xml).toContain('<KodUE>EL</KodUE><NrVatUE>123456789</NrVatUE>');
    expect(xml).toContain('<Adres><KodKraju>GR</KodKraju>');
    await expectXsdValid(xml);
  });

  it('Grecja z „EL” w kraju adresu (prefiks VAT zamiast ISO) — w adresie „GR”, bo „EL” nie ma w TKodKraju', async () => {
    const xml = xmlOf(korekta({ buyer: { ...NABYWCA_EL, address: { ...NABYWCA_EL.address, countryCode: 'EL' } } }));
    expect(xml).toContain('<Adres><KodKraju>GR</KodKraju>');
    await expectXsdValid(xml);
  });

  it('pusty kraj adresu — kraj z prefiksu VAT-UE (jak przy zwykłej fakturze)', () => {
    const xml = xmlOf(korekta({ buyer: { ...NABYWCA_DE, address: { ...NABYWCA_DE.address, countryCode: '' } } }));
    expect(xml).toContain('<Adres><KodKraju>DE</KodKraju>');
  });

  it('numer VAT-UE z odstępami i małymi literami — postać kanoniczna w XML', () => {
    const xml = xmlOf(korekta({ buyer: { ...NABYWCA_DE, vatUeNumber: 'de 123 456 789' } }));
    expect(xml).toContain('<KodUE>DE</KodUE><NrVatUE>123456789</NrVatUE>');
  });

  it('kwotowa 23%: pozycje „po” spoza korekty „przed / po” nie ustawiają P_18', async () => {
    const xml = xmlOf(
      korekta({
        correctionType: 'amount_change',
        linesBefore: [pozycja('23')],
        linesAfter: [pozycja('oo')],
        amountChange: { netDelta: -100, vatDelta: -23, grossDelta: -123, description: 'Rabat' },
      }),
    );
    expect(xml).toContain('<P_18>2</P_18>');
    await expectXsdValid(xml);
  });

  it('nabywca z UE ze stawką 23% (bez np II): KodUE+NrVatUE, P_18=2 — zgodna z XSD', async () => {
    const xml = xmlOf(
      korekta({ linesBefore: [pozycja('23', 1000)], linesAfter: [pozycja('23', 900)] }),
    );
    expect(xml).toContain('<KodUE>DE</KodUE><NrVatUE>123456789</NrVatUE>');
    expect(xml).toContain('<P_13_1>-100.00</P_13_1><P_14_1>-23.00</P_14_1>');
    expect(xml).toContain('<P_18>2</P_18>');
    await expectXsdValid(xml);
  });

  it('nabywca z UE z Irlandii Płn. (XI) bez np II — dozwolony (towary), zgodna z XSD', async () => {
    const xml = xmlOf(
      korekta({ buyer: NABYWCA_XI, linesBefore: [pozycja('np', 1000)], linesAfter: [pozycja('np', 900)] }),
    );
    expect(xml).toContain('<KodUE>XI</KodUE><NrVatUE>123456789</NrVatUE>');
    expect(xml).toContain('<Adres><KodKraju>XI</KodKraju>');
    expect(xml).toContain('<P_13_8>-100.00</P_13_8>');
    expect(xml).toContain('<P_18>2</P_18>');
    await expectXsdValid(xml);
  });

  it.each([
    ['prefiks „GR” zamiast „EL”', 'GR123456789', /VAT-UE.*„EL”/],
    ['numer spoza wzorca TNrVatUE', 'DE123_456', /VAT-UE/],
    ['polski VAT-UE (to nie firma z innego państwa)', 'PL1234567890', /innego państwa UE/],
    ['pusty numer', '', /VAT-UE/],
  ])('bezpiecznik: %s — błąd zamiast XML', (_label, vatUeNumber, message) => {
    expect(() => xmlOf(korekta({ buyer: { ...NABYWCA_DE, vatUeNumber }, linesBefore: [pozycja('23')], linesAfter: [pozycja('23', 900)] })))
      .toThrow(message);
  });

  it('kraj adresu Polska dla firmy z UE — błąd (adres nabywcy z UE jest za granicą)', () => {
    expect(() => xmlOf(korekta({ buyer: { ...NABYWCA_DE, address: { ...NABYWCA_DE.address, countryCode: 'PL' } } })))
      .toThrow(/kraj adresu/);
  });
});

describe('KOR — reguła „np II” wymaga nabywcy z innego państwa UE', () => {
  it('nabywca z NIP + np II (przed/po) — błąd', () => {
    expect(() => xmlOf(korekta({ buyer: NABYWCA_NIP }))).toThrow(NP_II_CORRECTION_BUYER_MESSAGE);
  });

  it('nabywca z NIP + np II tylko po korekcie — błąd', () => {
    expect(() => xmlOf(korekta({ buyer: NABYWCA_NIP, linesBefore: [pozycja('23')], linesAfter: [pozycja('np_ii')] })))
      .toThrow(NP_II_CORRECTION_BUYER_MESSAGE);
  });

  it('osoba prywatna + np II — błąd', () => {
    expect(() => xmlOf(korekta({ buyer: NABYWCA_B2C }))).toThrow(NP_II_CORRECTION_BUYER_MESSAGE);
  });

  it('Irlandia Płn. (XI) + np II — błąd: numer XI obejmuje tylko towary', () => {
    expect(() => xmlOf(korekta({ buyer: NABYWCA_XI }))).toThrow(NP_II_NOT_FOR_XI_MESSAGE);
  });

  it('kwotowa np II z nabywcą z NIP — błąd (stawka korekty kwotowej też się liczy)', () => {
    expect(() =>
      xmlOf(
        korekta({
          buyer: NABYWCA_NIP,
          correctionType: 'amount_change',
          linesBefore: undefined,
          linesAfter: undefined,
          amountChange: { netDelta: -100, vatDelta: 0, grossDelta: -100, description: 'Rabat', vatRate: 'np_ii' },
        }),
      ),
    ).toThrow(NP_II_CORRECTION_BUYER_MESSAGE);
  });

  it('anulująca np II z nabywcą z NIP — błąd', () => {
    expect(() => xmlOf(korekta({ buyer: NABYWCA_NIP, correctionType: 'cancellation', linesAfter: undefined })))
      .toThrow(NP_II_CORRECTION_BUYER_MESSAGE);
  });
});

describe('KOR — P_18 (odwrotne obciążenie) i stawki bez VAT', () => {
  it('P_18=1, gdy np II jest na fakturze pierwotnej, choć korekta zmienia tylko pozycję 23%', async () => {
    const xml = xmlOf(
      korekta({
        linesBefore: [pozycja('23', 100, 'Licencja'), pozycja('np_ii', 1000)],
        linesAfter: [pozycja('23', 50, 'Licencja'), pozycja('np_ii', 1000)],
      }),
    );
    // Pozycja np II bez zmian nie trafia do XML, ale adnotacja dotyczy faktury.
    expect(xml).not.toContain('np II');
    expect(xml).toContain('<P_18>1</P_18>');
    await expectXsdValid(xml);
  });

  it('P_18=1, gdy pozycja oo pojawia się dopiero po korekcie', () => {
    const xml = xmlOf(
      korekta({ buyer: NABYWCA_NIP, linesBefore: [pozycja('23')], linesAfter: [pozycja('23'), pozycja('oo', 500, 'Usługa budowlana')] }),
    );
    expect(xml).toContain('<P_13_10>500.00</P_13_10>');
    expect(xml).toContain('<P_18>1</P_18>');
  });

  it('kwotowa np I: P_12 „np I”, P_13_8, P_18=2 — zgodna z XSD', async () => {
    const xml = xmlOf(
      korekta({
        buyer: NABYWCA_NIP,
        correctionType: 'amount_change',
        linesBefore: undefined,
        linesAfter: undefined,
        amountChange: { netDelta: -300, vatDelta: 0, grossDelta: -300, description: 'Rabat', vatRate: 'np' },
      }),
    );
    expect(xml).toContain('<P_13_8>-300.00</P_13_8>');
    expect(xml).toContain('<P_12>np I</P_12>');
    expect(xml).toContain('<P_18>2</P_18>');
    await expectXsdValid(xml);
  });

  it('kwotowa oo: P_12 „oo”, P_13_10, P_18=1 — zgodna z XSD', async () => {
    const xml = xmlOf(
      korekta({
        buyer: NABYWCA_NIP,
        correctionType: 'amount_change',
        linesBefore: undefined,
        linesAfter: undefined,
        amountChange: { netDelta: -300, vatDelta: 0, grossDelta: -300, description: 'Rabat', vatRate: 'oo' },
      }),
    );
    expect(xml).toContain('<P_13_10>-300.00</P_13_10>');
    expect(xml).toContain('<P_12>oo</P_12>');
    expect(xml).toContain('<P_18>1</P_18>');
    await expectXsdValid(xml);
  });

  it('kwotowa z VAT 0 bez jawnej stawki — dalej „0 KR” (P_13_6_1), P_18=2', () => {
    const xml = xmlOf(
      korekta({
        buyer: NABYWCA_NIP,
        correctionType: 'amount_change',
        linesBefore: undefined,
        linesAfter: undefined,
        amountChange: { netDelta: -300, vatDelta: 0, grossDelta: -300, description: 'Rabat' },
      }),
    );
    expect(xml).toContain('<P_13_6_1>-300.00</P_13_6_1>');
    expect(xml).toContain('<P_12>0 KR</P_12>');
    expect(xml).toContain('<P_18>2</P_18>');
  });
});
