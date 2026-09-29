import { describe, expect, it } from 'vitest';

import { generateJpkFa, resolveTaxOfficeCode } from '@/lib/exports/jpk-fa-generator';
import { MissingTaxOfficeError } from '@/lib/exports/tax-office';

/**
 * KodUrzedu w JPK_FA — urząd skarbowy FIRMY (Ustawienia → Księgowa, #67).
 *
 * Do 27.09 brak kodu zamieniał się w „1408”, opisany w kodzie jako Warszawa-
 * Mokotów — według słownika MF to Urząd Skarbowy w Kozienicach. Każdy plik
 * wskazywał ten urząd i przechodził walidację, więc nikt tego nie widział.
 * Teraz brak urzędu to błąd z komunikatem, nie cichy zamiennik.
 */
describe('resolveTaxOfficeCode', () => {
  it('kod ze słownika MF przechodzi', () => {
    expect(resolveTaxOfficeCode('1471')).toBe('1471');
    expect(resolveTaxOfficeCode('0271')).toBe('0271');
    expect(resolveTaxOfficeCode('  1471  ')).toBe('1471');
  });

  it.each([undefined, null, '', '14', '14080', '14AB', '9999'])(
    'brak albo kod spoza słownika (%j) — błąd, nie „Kozienice”',
    (code) => {
      expect(() => resolveTaxOfficeCode(code)).toThrow(MissingTaxOfficeError);
    },
  );

  it('komunikat mówi, gdzie ustawić urząd', () => {
    expect(() => resolveTaxOfficeCode(null)).toThrow(/Ustawienia → Księgowa/);
  });
});

describe('generateJpkFa — KodUrzedu', () => {
  // JPK_FA(4): co najmniej jedna faktura i adres z GUS (województwo, powiat, gmina).
  const dane = (taxOfficeCode?: string) => ({
    issuer: {
      nip: '5260001246',
      name: 'Moja Firma',
      taxOfficeCode,
      registeredAddress: {
        voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Mokotów',
        buildingNumber: '1', city: 'Warszawa', postCode: '00-001',
      },
    },
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    issuedInvoices: [
      {
        invoiceNumber: 'FV/1', invoiceType: 'regular' as const, issueDate: '2026-08-10', buyerName: 'Klient',
        netTotal: 100, vatTotal: 23, grossTotal: 123,
        lines: [{ position: 1, name: 'Usługa', unit: 'szt.', quantity: 1, unitPriceNet: 100, netAmount: 100, vatRate: '23' }],
      },
    ],
  });

  it('urząd firmy trafia do nagłówka', () => {
    expect(generateJpkFa(dane('1433'))).toContain('<KodUrzedu>1433</KodUrzedu>');
  });

  it('bez urzędu plik nie powstaje', () => {
    expect(() => generateJpkFa(dane())).toThrow(MissingTaxOfficeError);
  });
});
