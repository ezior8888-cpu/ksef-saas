import { describe, expect, it } from 'vitest';

import { generateFA3Xml, InvoiceValidationError } from '@/lib/xml/fa3-generator';
import { finalizeInvoice, validateInvoice, type InvoiceInput } from '@/lib/xml/invoice-calculator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import { generateAdvanceInvoiceXml, generateFinalInvoiceXml } from '@/lib/ksef/fa3-advance-generator';
import { generateCorrectionInvoiceXml } from '@/lib/ksef/fa3-correction-generator';
import { NP_II_REQUIRES_EU_BUYER_MESSAGE } from '@/lib/schemas/invoice-form';
import type { BuyerParty, Invoice } from '@/types/invoice';
import type {
  AdvanceInvoiceData,
  BuyerData,
  CorrectionInvoiceData,
  FinalInvoiceData,
  InvoiceLine,
  SellerData,
} from '@/types/invoice-types';

/**
 * AUD-70: usługi z art. 100 ust. 1 pkt 4 ustawy o VAT (art. 28b — usługa dla
 * podatnika z innego państwa UE). XSD: P_12 = „np II”, suma w P_13_9, bez
 * P_14, a P_18 = 1 („odwrotne obciążenie” — VAT rozlicza nabywca). Nabywca
 * musi być identyfikowany numerem VAT-UE innego państwa (KodUE + NrVatUE).
 */

const NOW = new Date('2026-10-01T00:00:00Z');

// Sprzedawca jak w fixture'ach `fa3-generator.test.ts`: generator zwykłej
// faktury uruchamia `validateInvoice`, więc NIP musi mieć poprawną sumę
// kontrolną (fikcyjny `1234567890` jej nie ma).
const SPRZEDAWCA = {
  nip: '5260001246',
  name: 'ACME Software sp. z o.o.',
  address: { countryCode: 'PL', addressLine1: 'ul. Przykładowa 1/2', addressLine2: '00-001 Warszawa' },
};

const NABYWCA_DE: BuyerParty = {
  vatUeNumber: 'DE123456789',
  name: 'Kunde GmbH',
  address: { countryCode: 'DE', addressLine1: 'Hauptstrasse 1', addressLine2: '10115 Berlin' },
};

const NABYWCA_EL: BuyerParty = {
  vatUeNumber: 'EL123456789',
  name: 'Pelatis A.E.',
  address: { countryCode: 'GR', addressLine1: 'Odos Ermou 1', addressLine2: '10563 Athina' },
};

const USLUGA_NP_II = {
  ordinal: 1,
  name: 'Usługa programistyczna (art. 28b)',
  unit: 'usł.',
  quantity: 1,
  unitPriceNet: 1000,
  vatRate: 'np_ii',
} as const;

function faktura(o: Partial<InvoiceInput> = {}): Invoice {
  return finalizeInvoice({
    internalNumber: 'FV 1/09/2026',
    type: 'VAT',
    issueDate: '2026-09-26',
    saleDate: '2026-09-26',
    seller: SPRZEDAWCA,
    buyer: NABYWCA_DE,
    lines: [USLUGA_NP_II],
    payment: { currency: 'PLN', dueDate: '2026-10-10', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
    ...o,
  });
}

function bledy(o: Partial<InvoiceInput>): string[] {
  return validateInvoice(faktura(o), NOW);
}

describe('FA(3) — np II, faktura zwykła (AUD-70)', () => {
  it('nabywca z DE, jedna pozycja np II: P_12 „np II”, P_13_9, bez P_14, P_18=1 — zgodna z XSD', async () => {
    const invoice = faktura();
    expect(validateInvoice(invoice, NOW)).toEqual([]);

    const xml = generateFA3Xml(invoice);
    expect(xml).toContain('<KodUE>DE</KodUE><NrVatUE>123456789</NrVatUE>');
    expect(xml).toContain('<P_12>np II</P_12>');
    expect(xml).toContain('<P_13_9>1000.00</P_13_9>');
    expect(xml).not.toMatch(/<P_14_/);
    expect(xml).toContain('<P_15>1000.00</P_15>');
    expect(xml).toContain('<P_18>1</P_18>');

    const wynik = await validateInvoiceXml(xml);
    expect(wynik.errors).toEqual([]);
    expect(wynik.valid).toBe(true);
  });

  it('nabywca z Grecji: KodUE „EL”, a kraj adresu „GR”; 23% + np II — zgodna z XSD', async () => {
    const invoice = faktura({
      buyer: NABYWCA_EL,
      lines: [
        { ordinal: 1, name: 'Licencja', unit: 'szt.', quantity: 1, unitPriceNet: 100, vatRate: '23' },
        { ...USLUGA_NP_II, ordinal: 2 },
      ],
    });
    expect(validateInvoice(invoice, NOW)).toEqual([]);

    const xml = generateFA3Xml(invoice);
    expect(xml).toContain('<KodUE>EL</KodUE><NrVatUE>123456789</NrVatUE>');
    expect(xml).toContain('<Adres><KodKraju>GR</KodKraju>');
    expect(xml).toContain('<P_13_1>100.00</P_13_1><P_14_1>23.00</P_14_1>');
    expect(xml).toContain('<P_13_9>1000.00</P_13_9>');
    expect(xml).toContain('<P_18>1</P_18>');

    const wynik = await validateInvoiceXml(xml);
    expect(wynik.errors).toEqual([]);
    expect(wynik.valid).toBe(true);
  });

  it('np I („np”) bez zmian: P_12 „np I”, P_13_8, P_18=2', async () => {
    const xml = generateFA3Xml(
      faktura({
        buyer: {
          nip: '5252241585',
          name: 'Klient sp. z o.o.',
          address: { countryCode: 'PL', addressLine1: 'ul. Klienta 10', addressLine2: '02-001 Warszawa' },
        },
        lines: [{ ...USLUGA_NP_II, vatRate: 'np' }],
      }),
    );
    expect(xml).toContain('<P_12>np I</P_12>');
    expect(xml).toContain('<P_13_8>1000.00</P_13_8>');
    expect(xml).toContain('<P_18>2</P_18>');
    expect((await validateInvoiceXml(xml)).valid).toBe(true);
  });

  it('oo nadal wymusza P_18=1', () => {
    const xml = generateFA3Xml(
      faktura({
        buyer: {
          nip: '5252241585',
          name: 'Klient sp. z o.o.',
          address: { countryCode: 'PL', addressLine1: 'ul. Klienta 10', addressLine2: '02-001 Warszawa' },
        },
        lines: [{ ...USLUGA_NP_II, vatRate: 'oo' }],
      }),
    );
    expect(xml).toContain('<P_18>1</P_18>');
  });
});

describe('validateInvoice — np II i numer VAT-UE nabywcy (AUD-70)', () => {
  const NP_II = /„np II”/;
  const VAT_UE_ZLY = /Numer VAT-UE nabywcy/;
  const KRAJ_ADRESU = /kraj w adresie/;

  it('np II z nabywcą z NIP — błąd', () => {
    const errors = bledy({
      buyer: {
        nip: '1234567890',
        name: 'Nabywca testowy',
        address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' },
      },
    });
    expect(errors.some((e) => NP_II.test(e))).toBe(true);
  });

  it('np II z polskim numerem VAT-UE (PL…) — błąd, to nie nabywca z innego państwa', () => {
    const errors = bledy({
      buyer: {
        vatUeNumber: 'PL1234567890',
        name: 'Nabywca testowy',
        address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' },
      },
    });
    expect(errors.some((e) => NP_II.test(e))).toBe(true);
    expect(errors.some((e) => VAT_UE_ZLY.test(e))).toBe(false);
  });

  it('np II dla firmy z Irlandii Płn. (XI) — błąd: XI to numer tylko dla towarów', () => {
    const errors = bledy({
      buyer: {
        vatUeNumber: 'XI123456789',
        name: 'Nabywca testowy',
        address: { countryCode: 'XI', addressLine1: '1 Test Street', addressLine2: 'BT1 1AA Belfast' },
      },
    });
    expect(errors.some((e) => NP_II.test(e))).toBe(true);
    expect(errors.some((e) => VAT_UE_ZLY.test(e))).toBe(false);
  });

  it('prefiks „GR” zamiast „EL” — błąd numeru VAT-UE (z podpowiedzią) i błąd np II', () => {
    const errors = bledy({ buyer: { ...NABYWCA_EL, vatUeNumber: 'GR123456789' } });
    const vatUe = errors.find((e) => VAT_UE_ZLY.test(e));
    expect(vatUe).toBeDefined();
    expect(vatUe).toMatch(/„EL”/);
    expect(errors.some((e) => NP_II.test(e))).toBe(true);
  });

  it('numer niezgodny ze wzorem TNrVatUE (ponad 12 znaków, znak spoza [0-9A-Z+*]) — błąd', () => {
    expect(bledy({ buyer: { ...NABYWCA_DE, vatUeNumber: 'DE1234567890123' } }).some((e) => VAT_UE_ZLY.test(e))).toBe(true);
    expect(bledy({ buyer: { ...NABYWCA_DE, vatUeNumber: 'DE123_456' } }).some((e) => VAT_UE_ZLY.test(e))).toBe(true);
  });

  it('zagraniczny VAT-UE z adresem w Polsce albo bez kraju — błąd adresu', () => {
    const pl = bledy({ buyer: { ...NABYWCA_DE, address: { ...NABYWCA_DE.address, countryCode: 'PL' } } });
    expect(pl.some((e) => KRAJ_ADRESU.test(e))).toBe(true);
    const brak = bledy({ buyer: { ...NABYWCA_DE, address: { ...NABYWCA_DE.address, countryCode: '' } } });
    expect(brak.some((e) => KRAJ_ADRESU.test(e))).toBe(true);
    // Podpowiedź kraju: dla Grecji ISO „GR”, nie prefiks „EL”.
    const el = bledy({ buyer: { ...NABYWCA_EL, address: { ...NABYWCA_EL.address, countryCode: 'PL' } } });
    expect(el.find((e) => KRAJ_ADRESU.test(e))).toMatch(/„GR”/);
  });

  it('polski VAT-UE bez np II — bez nowych błędów (KodUE „PL” jest w XSD)', () => {
    const errors = bledy({
      buyer: {
        vatUeNumber: 'PL5252241585',
        name: 'Nabywca testowy',
        address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' },
      },
      lines: [{ ...USLUGA_NP_II, vatRate: '23' }],
    });
    expect(errors).toEqual([]);
  });

  it('generator odrzuca np II dla nabywcy z NIP (InvoiceValidationError), zamiast wysłać do KSeF', () => {
    const invoice = faktura({
      buyer: {
        nip: '5252241585',
        name: 'Klient sp. z o.o.',
        address: { countryCode: 'PL', addressLine1: 'ul. Klienta 10', addressLine2: '02-001 Warszawa' },
      },
    });
    expect(() => generateFA3Xml(invoice)).toThrow(InvoiceValidationError);
  });

  it('bezpiecznik generatora: zły prefiks VAT-UE bez walidacji nie daje błędnego XML', () => {
    const invoice = faktura({ buyer: { ...NABYWCA_EL, vatUeNumber: 'GR123456789' } });
    expect(() => generateFA3Xml(invoice, { validate: false })).toThrow(/VAT-UE.*„EL”/);
    const zlyWzor = faktura({ buyer: { ...NABYWCA_DE, vatUeNumber: 'DE123_456' } });
    expect(() => generateFA3Xml(zlyWzor, { validate: false })).toThrow(/VAT-UE/);
  });
});

describe('ZAL / ROZ — np II nieobsługiwane; KOR — np II tylko z nabywcą z UE', () => {
  const SELLER: SellerData = {
    nip: '1234567890',
    name: 'Sprzedawca testowy',
    address: { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' },
  };
  const BUYER: BuyerData = {
    type: 'b2b',
    idType: 'nip',
    nip: '1234567890',
    name: 'Nabywca testowy',
    address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' },
  };
  const pozycja = (vatRate: InvoiceLine['vatRate'], unitPriceNet = 1000): InvoiceLine => ({
    name: 'Usługa',
    unit: 'usł.',
    quantity: 1,
    unitPriceNet,
    vatRate,
  });
  const NP_II_NIEOBSLUGIWANE = /„np II”.*VAT-UE/;

  it('ZAL: stawka np II w kopercie (dane spoza typu) — czytelny błąd zamiast wywrotki', () => {
    const data: AdvanceInvoiceData = {
      invoiceType: 'advance',
      taxAnnotations: { cashMethod: 2, splitPayment: 2 },
      internalNumber: 'FZ 1/09/2026',
      issueDate: '2026-09-26',
      paymentMethod: 'transfer',
      paymentDueDate: '2026-10-10',
      bankAccount: 'PL61109010140000071219812874',
      seller: SELLER,
      buyer: BUYER,
      advanceAmount: 1000,
      totalContractAmount: 5000,
      // Koperta z bazy (JSON) nie przechodzi przez typ — symulujemy np II.
      vatRate: 'np_ii' as unknown as AdvanceInvoiceData['vatRate'],
      description: 'Usługa doradcza',
    };
    expect(() => generateAdvanceInvoiceXml(data)).toThrow(NP_II_NIEOBSLUGIWANE);
  });

  it('ROZ: pozycja np II — błąd przed budową XML', () => {
    const data: FinalInvoiceData = {
      invoiceType: 'final',
      taxAnnotations: { cashMethod: 2, splitPayment: 2 },
      internalNumber: 'FR 1/09/2026',
      issueDate: '2026-09-26',
      paymentMethod: 'transfer',
      paymentDueDate: '2026-10-10',
      bankAccount: 'PL61109010140000071219812874',
      seller: SELLER,
      buyer: BUYER,
      advanceInvoiceIds: ['00000000-0000-4000-8000-000000000001'],
      totalAdvances: 1230,
      lines: [pozycja('23', 5000), pozycja('np_ii')],
    };
    const zaliczki = [{ internal_number: 'FZ 1/09/2026', ksef_number: null, advance_amount: 1230, issue_date: '2026-09-01', vat_rate: '23' }];
    expect(() => generateFinalInvoiceXml(data, zaliczki)).toThrow(NP_II_NIEOBSLUGIWANE);
  });

  it('ROZ: zaliczka w stawce np II — ten sam błąd', () => {
    const data: FinalInvoiceData = {
      invoiceType: 'final',
      taxAnnotations: { cashMethod: 2, splitPayment: 2 },
      internalNumber: 'FR 1/09/2026',
      issueDate: '2026-09-26',
      paymentMethod: 'transfer',
      paymentDueDate: '2026-10-10',
      bankAccount: 'PL61109010140000071219812874',
      seller: SELLER,
      buyer: BUYER,
      advanceInvoiceIds: ['00000000-0000-4000-8000-000000000001'],
      totalAdvances: 1000,
      lines: [pozycja('23', 5000)],
    };
    const zaliczki = [{ internal_number: 'FZ 1/09/2026', ksef_number: null, advance_amount: 1000, issue_date: '2026-09-01', vat_rate: 'np_ii' }];
    expect(() => generateFinalInvoiceXml(data, zaliczki)).toThrow(NP_II_NIEOBSLUGIWANE);
  });

  const korekta = (o: Partial<CorrectionInvoiceData>): CorrectionInvoiceData => ({
    invoiceType: 'correction',
    internalNumber: 'FK 1/10/2026',
    issueDate: '2026-10-02',
    paymentMethod: 'transfer',
    paymentDueDate: '2026-10-16',
    parentInvoiceId: '00000000-0000-4000-8000-000000000001',
    parentInvoiceNumber: 'FV 1/09/2026',
    parentInvoiceIssueDate: '2026-09-26',
    correctionType: 'before_after',
    correctionReason: 'Zmiana ceny',
    typKorekty: '2',
    seller: SELLER,
    buyer: BUYER,
    linesBefore: [pozycja('np_ii', 1000)],
    linesAfter: [pozycja('np_ii', 900)],
    ...o,
  });

  // KOR obsługuje już nabywcę z UE (KodUE + NrVatUE) — szczegóły
  // w `korekta-nabywca-ue.test.ts`. Nabywca z NIP z np II dalej odpada.
  it('KOR przed/po: pozycja np II z nabywcą z NIP — błąd', () => {
    expect(() => generateCorrectionInvoiceXml(korekta({}))).toThrow(NP_II_REQUIRES_EU_BUYER_MESSAGE);
    expect(() =>
      generateCorrectionInvoiceXml(korekta({ linesBefore: [pozycja('23')], linesAfter: [pozycja('np_ii')] })),
    ).toThrow(NP_II_REQUIRES_EU_BUYER_MESSAGE);
  });

  it('KOR anulująca fakturę z np II z nabywcą z NIP — błąd', () => {
    expect(() =>
      generateCorrectionInvoiceXml(korekta({ correctionType: 'cancellation', linesAfter: undefined })),
    ).toThrow(NP_II_REQUIRES_EU_BUYER_MESSAGE);
  });

  it('KOR przed/po np II z nabywcą z UE (DE) — P_13_9, P_18=1, XSD poprawny', async () => {
    const xml = generateCorrectionInvoiceXml(
      korekta({
        buyer: {
          type: 'eu',
          vatUeNumber: 'DE123456789',
          name: 'Kunde GmbH',
          address: { countryCode: 'DE', addressLine1: 'Hauptstrasse 1', addressLine2: '10115 Berlin' },
        },
      }),
      { prettyPrint: false },
    );
    expect(xml).toContain('<KodUE>DE</KodUE><NrVatUE>123456789</NrVatUE>');
    expect(xml).toContain('<P_13_9>-100.00</P_13_9>');
    expect(xml).toContain('<P_18>1</P_18>');
    expect((await validateInvoiceXml(xml)).valid).toBe(true);
  });

  it('KOR bez np II — bez zmian (P_18=2, XSD poprawny)', async () => {
    const xml = generateCorrectionInvoiceXml(korekta({ linesBefore: [pozycja('23', 1000)], linesAfter: [pozycja('23', 900)] }));
    expect(xml).toContain('<P_18>2</P_18>');
    expect((await validateInvoiceXml(xml)).valid).toBe(true);
  });
});
