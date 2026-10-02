import { describe, expect, it } from 'vitest';

import type { ExportExpense } from '@/lib/exports/data-fetcher';
import type { JpkInvoice } from '@/lib/exports/jpk-fa-generator';
import { generateJpkV7m, MissingTaxpayerEmailError, summarizeJpkV7m, wholeZloty } from '@/lib/exports/jpk-v7m-generator';
import { validateJpkV7m } from '@/lib/exports/jpk-v7m-validator';
import { MissingTaxOfficeError } from '@/lib/exports/tax-office';

/**
 * JPK_V7M(3) — wzór CRWDE 2025/12/19/14090, obowiązuje od rozliczenia za luty
 * 2026. Do 27.09.2026 generator tworzył wersję (2): plik odpadał na bramce MF
 * już na pierwszym elemencie. Test: OFICJALNY schemat XSD.
 */

const KSEF_SPRZEDAZ = '5260001246-20260805-0100001AF629-AF';
const KSEF_ZAKUP = '5252241585-20260806-0100001AF629-B0';

function faktura(o: Partial<JpkInvoice>): JpkInvoice {
  return {
    invoiceNumber: 'FS/1/08',
    currency: 'PLN',
    invoiceType: 'regular',
    issueDate: '2026-08-05',
    buyerName: 'Klient Sp. z o.o.',
    buyerNip: '5252241585',
    netTotal: 1000,
    vatTotal: 230,
    grossTotal: 1230,
    ksefNumber: KSEF_SPRZEDAZ,
    lines: [{ position: 1, name: 'Usługa', unit: 'szt.', quantity: 1, unitPriceNet: 1000, netAmount: 1000, vatRate: '23' }],
    ...o,
  } as JpkInvoice;
}

function koszt(o: Partial<ExportExpense>): ExportExpense {
  return {
    id: 'exp-1',
    issueDate: '2026-08-06',
    documentNumber: 'FZ/7/08',
    documentType: 'invoice',
    sellerName: 'Dostawca Sp. z o.o.',
    sellerNip: '5252241585',
    sellerAddress: null,
    netAmount: 200,
    vatAmount: 46,
    grossAmount: 246,
    vatDeductibleAmount: 46,
    kpirColumn: 'col_13',
    categoryLabel: 'Usługi',
    ksefNumber: KSEF_ZAKUP,
    ...o,
  };
}

const linia = (netAmount: number, vatRate: string) => ({ position: 1, name: 'x', unit: 'szt.', quantity: 1, unitPriceNet: netAmount, netAmount, vatRate });

const dane = {
  issuer: { nip: '5260001246', name: 'Moja Firma Sp. z o.o.', email: 'biuro@example.test', taxOfficeCode: '1433' },
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  generatedAt: new Date('2026-09-10T10:00:00Z'),
  issuedInvoices: [
    faktura({}),
    faktura({ invoiceNumber: 'FS/2/08', saleDate: '2026-07-31', lines: [linia(500, '8')] }),
    faktura({ invoiceNumber: 'FS/3/08', lines: [linia(300, '5')] }),
    faktura({ invoiceNumber: 'FS/4/08', lines: [linia(700, '0')] }),
    faktura({ invoiceNumber: 'FS/5/08', lines: [linia(1500, 'zw')] }),
    // Konsument, faktura spoza KSeF (np. import z pliku) — BFK.
    faktura({ invoiceNumber: 'FS/6/08', buyerNip: undefined, buyerName: 'Jan Kowalski', ksefNumber: undefined, lines: [linia(100, '23')] }),
  ],
  expenses: [
    koszt({}),
    // Faktura papierowa z OCR — BFK.
    koszt({ id: 'exp-2', documentNumber: 'PAP/1', ksefNumber: null, netAmount: 100, vatAmount: 23, grossAmount: 123, vatDeductibleAmount: 23 }),
    // Korekta in minus ze skrzynki (#68).
    koszt({ id: 'exp-3', documentNumber: 'KOR/1', netAmount: -50, vatAmount: -11.5, grossAmount: -61.5, vatDeductibleAmount: -11.5 }),
    // Paragon — bez prawa do odliczenia, nie trafia do ewidencji zakupów.
    koszt({ id: 'exp-4', documentType: 'receipt', ksefNumber: null }),
  ],
};

describe('JPK_V7M(3) — oficjalny schemat MF', () => {
  it('plik przechodzi XSD (CRWDE 2025/12/19/14090)', async () => {
    const result = await validateJpkV7m(generateJpkV7m(dane));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('nagłówek wersji (3), deklaracja VAT-7(23), urząd firmy', () => {
    const xml = generateJpkV7m(dane);
    expect(xml).toContain('kodSystemowy="JPK_V7M (3)"');
    expect(xml).toContain('<WariantFormularza>3</WariantFormularza>');
    expect(xml).toContain('kodSystemowy="VAT-7 (23)"');
    expect(xml).toContain('<KodUrzedu>1433</KodUrzedu>');
  });

  it('numer KSeF albo BFK w każdym wierszu', () => {
    const xml = generateJpkV7m(dane);
    expect(xml).toContain(`<NrKSeF>${KSEF_SPRZEDAZ}</NrKSeF>`);
    expect(xml).toContain(`<NrKSeF>${KSEF_ZAKUP}</NrKSeF>`);
    // FS/6 (spoza KSeF) i PAP/1 (papier z OCR).
    expect(xml.match(/<BFK>1<\/BFK>/g)).toHaveLength(2);
  });

  it('sprzedaż zwolniona (K_10/P_10) i 0% (K_13/P_13) w pliku', () => {
    const xml = generateJpkV7m(dane);
    expect(xml).toContain('<K_10>1500.00</K_10>');
    expect(xml).toContain('<K_13>700.00</K_13>');
    expect(xml).toContain('<P_10>1500</P_10>');
    expect(xml).toContain('<P_13>700</P_13>');
  });

  it('zakupy w P_42/P_43 (nie w polach korekt P_44/P_45), korekta in minus pomniejsza', () => {
    const xml = generateJpkV7m(dane);
    // 200 + 100 − 50 = 250 netto; 46 + 23 − 11,50 = 57,50 → 58 zł.
    expect(xml).toContain('<P_42>250</P_42>');
    expect(xml).toContain('<P_43>58</P_43>');
    expect(xml).not.toContain('<P_44>');
    expect(xml).not.toContain('<P_45>');
  });

  it('deklaracja w pełnych złotych, P_38 i P_51 ze składników', () => {
    // należny: 23% (1000+100)·0,23 = 253; 8% 40; 5% 15 → 308; naliczony 58 → do zapłaty 250.
    const s = summarizeJpkV7m(dane);
    expect(s).toMatchObject({ vatDue: 308, vatDeductible: 58, balance: 250 });
    const xml = generateJpkV7m(dane);
    expect(xml).toContain('<P_38>308</P_38>');
    expect(xml).toContain('<P_51>250</P_51>');
  });

  it('data sprzedaży tylko, gdy różni się od daty wystawienia', () => {
    const xml = generateJpkV7m(dane);
    expect(xml.match(/<DataSprzedazy>/g)).toHaveLength(1);
    expect(xml).toContain('<DataSprzedazy>2026-07-31</DataSprzedazy>');
  });

  it('bez urzędu albo e-maila — błąd zamiast złego pliku', () => {
    expect(() => generateJpkV7m({ ...dane, issuer: { ...dane.issuer, taxOfficeCode: undefined } })).toThrow(MissingTaxOfficeError);
    expect(() => generateJpkV7m({ ...dane, issuer: { ...dane.issuer, email: '' } })).toThrow(MissingTaxpayerEmailError);
  });

  it('nadwyżka: P_53 i P_62, P_51 = 0', async () => {
    const nadwyzka = { ...dane, issuedInvoices: [faktura({ lines: [linia(100, '23')] })] };
    const xml = generateJpkV7m(nadwyzka);
    expect(xml).toContain('<P_51>0</P_51>');
    expect(xml).toContain('<P_53>35</P_53>'); // 58 − 23
    expect(xml).toContain('<P_62>35</P_62>');
    expect((await validateJpkV7m(xml)).errors).toEqual([]);
  });
});

describe('zaokrąglenie do pełnych złotych (art. 63 § 1 Ordynacji)', () => {
  it.each([
    [10.49, 10],
    [10.5, 11],
    [-10.5, -11],
    [0.494, 0],
    [1234.505, 1235],
  ])('%d → %d', (n, expected) => {
    expect(wholeZloty(n)).toBe(expected);
  });
});

describe('walidator naprawdę odrzuca złe pliki (rejestr błędów nr 3)', () => {
  it('stara przestrzeń nazw wersji (2) — odrzucona', async () => {
    const xml = generateJpkV7m(dane).replace('http://crd.gov.pl/wzor/2025/12/19/14090/', 'http://crd.gov.pl/wzor/2021/12/27/11148/');
    const r = await validateJpkV7m(xml);
    expect(r.valid).toBe(false);
    expect(r.errors.join('\n')).toMatch(/No matching global declaration/);
  });

  it('pole w złej kolejności (P_38 przed P_37) — odrzucone', async () => {
    const xml = generateJpkV7m(dane).replace(/(<P_37>\d+<\/P_37>)(\s*)(<P_38>\d+<\/P_38>)/, '$3$2$1');
    expect(xml).toMatch(/<P_38>\d+<\/P_38>\s*<P_37>/);
    expect((await validateJpkV7m(xml)).valid).toBe(false);
  });

  it('kwota z groszami w deklaracji — odrzucona (TKwotaC = pełne złote)', async () => {
    const xml = generateJpkV7m(dane).replace(/<P_38>(\d+)<\/P_38>/, '<P_38>$1.00</P_38>');
    expect((await validateJpkV7m(xml)).valid).toBe(false);
  });
});
