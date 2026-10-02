import { describe, expect, it } from 'vitest';

import { generateComarchOptimaXml, OptimaForeignCurrencyNotSupportedError } from '@/lib/exports/comarch-optima-generator';
import { generateUniversalCsv } from '@/lib/exports/csv-generators';
import { counterpartyOf, generateJpkFa, type JpkInvoice } from '@/lib/exports/jpk-fa-generator';

/**
 * Strony dokumentu w eksportach. Do 26.09 faktura w eksporcie niosła tylko
 * NABYWCĘ, a każdy eksport brał go za kontrahenta:
 * - zakup (faktura otrzymana) miał jako kontrahenta NASZĄ firmę (CSV, Optima),
 * - JPK_FA wpisywał NIP nabywcy w P_4B (NIP sprzedawcy), P_5B był pusty,
 *   a sprzedawcy (P_3C/P_3D) nie było wcale — także przy sprzedaży.
 * Znaczenie pól wg broszury MF do JPK_FA(4).
 */

// Urząd skarbowy firmy (#67) — bez niego JPK_FA nie powstaje (zamiast „1408”).
const MY = { nip: '1234567890', name: 'Moja Firma', taxOfficeCode: '1433', address: { street: 'Główna', buildingNumber: '1', postCode: '00-001', city: 'Warszawa' } };

function faktura(o: Partial<JpkInvoice> = {}): JpkInvoice {
  return {
    invoiceNumber: 'FV/1',
    currency: 'PLN',
    invoiceType: 'regular',
    issueDate: '2026-08-10',
    buyerName: 'Klient Sp. z o.o.',
    buyerNip: '5252241585',
    buyerAddress: 'ul. Klienta 10, 02-001 Warszawa',
    netTotal: 100,
    vatTotal: 23,
    grossTotal: 123,
    lines: [{ position: 1, name: 'Usługa', unit: 'szt.', quantity: 1, unitPriceNet: 100, netAmount: 100, vatRate: '23' }],
    ...o,
  };
}

/** Faktura otrzymana tak, jak zapisuje ją skrzynka: bez nabywcy, sprzedawca z metadanych. */
function zakup(): JpkInvoice {
  return faktura({
    invoiceNumber: 'ZAK/7',
    buyerName: '',
    buyerNip: undefined,
    buyerAddress: '',
    sellerName: 'Dostawca Sp. z o.o.',
    sellerNip: '5260001246',
  });
}

const input = { issuer: MY, periodStart: '2026-08-01', periodEnd: '2026-08-31' };

describe('kontrahent wg kierunku', () => {
  it('sprzedaż → nabywca, zakup → sprzedawca', () => {
    expect(counterpartyOf(faktura(), 'issued')).toMatchObject({ name: 'Klient Sp. z o.o.', nip: '5252241585' });
    expect(counterpartyOf(zakup(), 'received')).toMatchObject({ name: 'Dostawca Sp. z o.o.', nip: '5260001246' });
  });
});

describe('JPK_FA — strony wg MF (P_3A/B nabywca, P_3C/D sprzedawca, P_4B NIP sprzedawcy, P_5B NIP nabywcy)', () => {
  // JPK_FA(4) obejmuje faktury WYSTAWIONE przez podatnika — faktur zakupu
  // w nim nie ma (od 28.09; test „zakup ze skrzynki” usunięty razem z nimi).
  it('sprzedaż: sprzedawcą jest wystawca pliku, P_4B = nasz NIP, P_5B = NIP nabywcy', () => {
    const registeredAddress = {
      voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Śródmieście',
      street: 'Główna', buildingNumber: '1', city: 'Warszawa', postCode: '00-001',
    };
    const xml = generateJpkFa({ ...input, issuer: { ...MY, registeredAddress }, issuedInvoices: [faktura()] });
    expect(xml).toContain('<P_3A>Klient Sp. z o.o.</P_3A>');
    expect(xml).toContain('<P_3C>Moja Firma</P_3C>');
    expect(xml).toContain('<P_3D>Główna 1, 00-001 Warszawa</P_3D>');
    expect(xml).toContain('<P_4B>1234567890</P_4B>');
    expect(xml).toContain('<P_5B>5252241585</P_5B>');
  });
});

describe('Comarch Optima — kontrahent faktury zakupu', () => {
  it('FZSP ma dostawcę, FASP nabywcę — nigdy naszej firmy', () => {
    const xml = generateComarchOptimaXml({ ...input, issuedInvoices: [faktura()], receivedInvoices: [zakup()] });
    const fzsp = xml.slice(xml.indexOf('FZSP'));
    expect(fzsp).toContain('<NIP>5260001246</NIP>');
    expect(fzsp).toContain('<Nazwa1>Dostawca Sp. z o.o.</Nazwa1>');
    const fasp = xml.slice(xml.indexOf('FASP'), xml.indexOf('FZSP'));
    expect(fasp).toContain('<Nazwa1>Klient Sp. z o.o.</Nazwa1>');
  });

  it.each([
    ['wystawiona EUR', [faktura({ currency: 'EUR' })], [zakup()]],
    ['wystawiona bez waluty', [faktura({ currency: undefined })], [zakup()]],
    ['odebrana EUR', [faktura()], [{ ...zakup(), currency: 'EUR' }]],
    ['odebrana bez waluty', [faktura()], [{ ...zakup(), currency: undefined }]],
  ])('%s: odmawia całego eksportu przed oznaczeniem kwot jako PLN', (_opis, issuedInvoices, receivedInvoices) => {
    expect(() => generateComarchOptimaXml({ ...input, issuedInvoices, receivedInvoices }))
      .toThrow(OptimaForeignCurrencyNotSupportedError);
  });
});

describe('CSV — kontrahent wg kierunku', () => {
  it('wiersz zakupu ma dostawcę', () => {
    const csv = generateUniversalCsv({ ...input, issuedInvoices: [faktura()], receivedInvoices: [zakup()] }).toString('utf8');
    const wiersze = csv.split('\r\n');
    const zakupWiersz = wiersze.find((w) => w.includes('ZAK/7'))!;
    expect(zakupWiersz).toContain('Dostawca Sp. z o.o.');
    expect(zakupWiersz).toContain('5260001246');
    expect(wiersze.find((w) => w.includes('FV/1'))).toContain('Klient Sp. z o.o.');
  });
});
