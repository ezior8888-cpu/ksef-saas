import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';

import {
  CsvForeignCurrencyNotSupportedError,
  generateInsertSubiektCsv,
  generateSymfoniaCsv,
  generateUniversalCsv,
  generateWaproCsv,
  type CsvExportInput,
} from '@/lib/exports/csv-generators';
import type { JpkInvoice } from '@/lib/exports/jpk-fa-generator';

/**
 * Faktura rozliczeniowa (ROZ) w CSV. W bazie ROZ ma PEŁNĄ wartość zamówienia
 * (`net_total`, #82), a na fakturze w KSeF są kwoty po odjęciu zaliczek
 * (art. 106f ust. 3, #84). Do 29.09 CSV brał kwoty z bazy, więc księgowa po
 * imporcie miała VAT zaliczki w rejestrze dwa razy: z faktury zaliczkowej
 * i drugi raz z rozliczeniowej. JPK_FA liczy to samo przez `amountsOf` (#91).
 *
 * Zamówienie 10 000 netto (23%), zaliczka 2 460 brutto (2 000 + 460):
 * na ROZ zostaje 8 000 netto, 1 840 VAT, do zapłaty 9 840.
 */

const zaliczka = { internal_number: 'FZ/1', ksef_number: null, issue_date: '2026-09-05', advance_amount: 2460, vat_rate: '23', net_amount: 2000, vat_amount: 460 };

function faktura(o: Partial<JpkInvoice> = {}): JpkInvoice {
  return {
    invoiceNumber: 'FR/1',
    currency: 'PLN',
    invoiceType: 'final',
    issueDate: '2026-09-20',
    buyerName: 'Klient Sp. z o.o.',
    buyerNip: '5252241585',
    netTotal: 10_000,
    vatTotal: 2_300,
    grossTotal: 12_300,
    lines: [{ position: 1, name: 'Zamówienie', unit: 'usł.', quantity: 1, unitPriceNet: 10_000, netAmount: 10_000, vatRate: '23' }],
    advanceSettlement: [zaliczka],
    ...o,
  };
}

function dane(o: Partial<CsvExportInput> = {}): CsvExportInput {
  return {
    issuer: { nip: '1234567890', name: 'Firma' },
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    issuedInvoices: [faktura()],
    receivedInvoices: [],
    ...o,
  };
}

/** Wiersz danych (bez nagłówka) jako mapa kolumna → wartość. */
function wiersze(buf: Buffer, sep: string, enc: 'utf8' | 'win1250' = 'utf8'): Array<Record<string, string>> {
  const text = (enc === 'win1250' ? iconv.decode(buf, 'win1250') : buf.toString('utf8')).replace(/^﻿/, '');
  const [head, ...rows] = text.split('\r\n').filter(Boolean);
  const cols = head!.split(sep);
  return rows.map((r) => Object.fromEntries(r.split(sep).map((v, i) => [cols[i]!, v])));
}

describe('CSV: ROZ z kwotami jak na fakturze w KSeF', () => {
  it.each([
    ['uniwersalny', () => wiersze(generateUniversalCsv(dane()), ';'), ['Netto', 'VAT', 'Brutto']],
    ['Subiekt', () => wiersze(generateInsertSubiektCsv(dane()), ';', 'win1250'), ['Netto', 'VAT', 'Brutto']],
    ['Symfonia', () => wiersze(generateSymfoniaCsv(dane()), ';'), ['WartoscNetto', 'WartoscVAT', 'WartoscBrutto']],
    ['Wapro', () => wiersze(generateWaproCsv(dane()), '\t'), ['netto', 'vat', 'brutto']],
  ] as const)('%s: netto i VAT po zaliczkach, brutto = do zapłaty', (_n, czytaj, [netto, vat, brutto]) => {
    const [w] = czytaj();
    expect(w![netto]).toBe('8000,00');
    expect(w![vat]).toBe('1840,00');
    expect(w![brutto]).toBe('9840,00');
  });

  it('dwie zaliczki w dwóch stawkach — odejmuje każdą w swojej', () => {
    const inv = faktura({
      netTotal: 1_100,
      vatTotal: 238,
      grossTotal: 1_338,
      lines: [
        { position: 1, name: 'A', unit: 'szt.', quantity: 1, unitPriceNet: 1_000, netAmount: 1_000, vatRate: '23' },
        { position: 2, name: 'B', unit: 'szt.', quantity: 1, unitPriceNet: 100, netAmount: 100, vatRate: '8' },
      ],
      advanceSettlement: [
        { ...zaliczka, advance_amount: 123, net_amount: 100, vat_amount: 23 },
        { ...zaliczka, internal_number: 'FZ/2', advance_amount: 54, vat_rate: '8', net_amount: 50, vat_amount: 4 },
      ],
    });
    const [w] = wiersze(generateUniversalCsv(dane({ issuedInvoices: [inv] })), ';');
    // 23%: 900 + 207; 8%: 50 + 4 → 950 netto, 211 VAT, 1338 − 177 = 1161 do zapłaty
    expect(w).toMatchObject({ Netto: '950,00', VAT: '211,00', Brutto: '1161,00' });
  });

  it('zwykła faktura sprzedaży — kwoty z bazy, także gdy nie ma pozycji', () => {
    // Faktura bez wierszy w `invoice_items` (np. sprzed pozycji) nie może
    // wyjść z zerami — zwykłej faktury nie przeliczamy z pozycji wcale.
    const inv = faktura({ invoiceNumber: 'FV/1', invoiceType: 'regular', lines: [], advanceSettlement: undefined });
    const [w] = wiersze(generateUniversalCsv(dane({ issuedInvoices: [inv] })), ';');
    expect(w).toMatchObject({ Netto: '10000,00', VAT: '2300,00', Brutto: '12300,00' });
  });

  it('faktura otrzymana oznaczona jako ROZ — kwoty z KSeF, bez przeliczania', () => {
    // Zakup przychodzi z metadanych KSeF, gdzie kwoty są już takie, jak
    // wystawił dostawca; nie mamy jego zaliczek, więc nic nie odejmujemy.
    const zakup = faktura({ invoiceNumber: 'DOST/ROZ/1', advanceSettlement: [zaliczka] });
    const [w] = wiersze(generateUniversalCsv(dane({ issuedInvoices: [], receivedInvoices: [zakup] })), ';');
    expect(w).toMatchObject({ Netto: '10000,00', VAT: '2300,00', Brutto: '12300,00' });
  });

  it.each([
    ['uniwersalny', generateUniversalCsv],
    ['Subiekt', generateInsertSubiektCsv],
    ['Symfonia', generateSymfoniaCsv],
    ['Wapro', generateWaproCsv],
  ] as const)('%s: odmawia dokumentów w EUR i bez potwierdzonej waluty', (_n, generate) => {
    const walutowa = faktura({
      invoiceNumber: 'EUR/1', invoiceType: 'regular', currency: 'EUR',
      netTotal: 100, vatTotal: 98.75, grossTotal: 123,
    });
    const bezWaluty = faktura({ invoiceNumber: 'UNKNOWN/1', currency: undefined });
    for (const issuedInvoices of [[walutowa], [bezWaluty]]) {
      expect(() => generate(dane({ issuedInvoices, receivedInvoices: [] })))
        .toThrow(CsvForeignCurrencyNotSupportedError);
    }
    for (const receivedInvoices of [[walutowa], [bezWaluty]]) {
      expect(() => generate(dane({ issuedInvoices: [], receivedInvoices })))
        .toThrow(CsvForeignCurrencyNotSupportedError);
    }
  });
});
