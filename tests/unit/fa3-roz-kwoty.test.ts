import PDFDocument from 'pdfkit';
import { describe, expect, it, vi } from 'vitest';

import { advanceVatRate, settlementRowFromAdvance } from '@/lib/invoices/advance-settlement';
import { amountDueOnPdf, renderInvoicePdf, settledAdvancesLine } from '@/lib/pdf/invoice-renderer';
import type { Invoice } from '@/types/invoice';
import {
  generateFinalInvoiceXml,
  settlementVatSummaries,
  type AdvanceInvoiceSettlementRow,
} from '@/lib/ksef/fa3-advance-generator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import type { FinalInvoiceData, InvoiceLine } from '@/types/invoice-types';

/**
 * Faktura rozliczająca (ROZ) w KSeF — art. 106f ust. 3 ustawy o VAT i broszura
 * MF FA(3): pozycje (FaWiersz) PEŁNE, P_13_x/P_14_x i P_15 PO odjęciu zaliczek.
 * Do 28.09 generator wysyłał pełne P_13/P_14/P_15, a zaliczki odejmował
 * w `Rozliczenie/Odliczenia` — VAT zaliczek był na fakturze drugi raz.
 */

const SELLER = {
  nip: '5260001246',
  name: 'ACME Software sp. z o.o.',
  address: { countryCode: 'PL', addressLine1: 'ul. Przykładowa 1/2', addressLine2: '00-001 Warszawa' },
  email: 'biuro@acme.test',
};
const BUYER = {
  type: 'b2b',
  idType: 'nip',
  nip: '5252241585',
  name: 'Klient sp. z o.o.',
  address: { countryCode: 'PL', addressLine1: 'ul. Klienta 10', addressLine2: '02-001 Warszawa' },
  email: 'kontakt@klient.test',
};

function roz(lines: InvoiceLine[], totalAdvances: number): FinalInvoiceData {
  return {
    invoiceType: 'final',
    internalNumber: 'FR/2026/09/1',
    issueDate: '2026-09-20',
    paymentMethod: 'transfer',
    paymentDueDate: '2026-10-04',
    bankAccount: 'PL61109010140000071219812874',
    seller: SELLER,
    buyer: BUYER,
    taxAnnotations: { cashMethod: 2, splitPayment: 2 },
    advanceInvoiceIds: ['00000000-0000-0000-0000-000000000001'],
    totalAdvances,
    lines,
  } as FinalInvoiceData;
}

const pozycja = (name: string, quantity: number, unitPriceNet: number, vatRate: InvoiceLine['vatRate']): InvoiceLine =>
  ({ name, unit: 'usł.', quantity, unitPriceNet, vatRate }) as InvoiceLine;

function zaliczka(o: Partial<AdvanceInvoiceSettlementRow>): AdvanceInvoiceSettlementRow {
  return { internal_number: 'ZAL/1', ksef_number: '5260001246-20260801-ABCDEF123456-01', advance_amount: 0, issue_date: '2026-08-01', ...o };
}

// Zamówienie: 23% — 10 000 + 2 × 10 000 netto; 8% — 1 000 netto. Brutto 37 980.
const ZAMOWIENIE = [
  pozycja('Projekt', 1, 10000, '23'),
  pozycja('Wdrożenie', 2, 10000, '23'),
  pozycja('Szkolenie', 1, 1000, '8'),
];
// Zaliczka 23% z rozbiciem z bazy; zaliczka 8% bez rozbicia (wzór jak na ZAL).
const ZALICZKI = [
  zaliczka({ internal_number: 'ZAL/1', advance_amount: 12300, vat_rate: '23', net_amount: 10000, vat_amount: 2300 }),
  zaliczka({ internal_number: 'ZAL/2', ksef_number: null, advance_amount: 1080, vat_rate: '8' }),
];

describe('ROZ: XML do KSeF', () => {
  const xml = generateFinalInvoiceXml(roz(ZAMOWIENIE, 13380), ZALICZKI);

  it('przechodzi oficjalny XSD FA(3)', async () => {
    const wynik = await validateInvoiceXml(xml);
    expect(wynik.errors).toEqual([]);
    expect(wynik.valid).toBe(true);
  });

  it('P_13_x/P_14_x: zamówienie minus zaliczki, każda w swojej stawce', () => {
    expect(xml).toContain('<P_13_1>20000.00</P_13_1>');
    expect(xml).toContain('<P_14_1>4600.00</P_14_1>');
    expect(xml).toContain('<P_13_2>0.00</P_13_2>');
    expect(xml).toContain('<P_14_2>0.00</P_14_2>');
  });

  it('P_15: kwota pozostała do zapłaty', () => {
    expect(xml).toContain('<P_15>24600.00</P_15>');
    expect(xml).not.toContain('<P_15>37980.00</P_15>');
  });

  it('FaWiersz: pełne wartości zamówienia', () => {
    expect(xml).toContain('<P_11>10000.00</P_11>');
    expect(xml).toContain('<P_11>20000.00</P_11>');
    expect(xml).toContain('<P_11>1000.00</P_11>');
  });

  it('bez Rozliczenie/Odliczenia — zaliczki nie odejmują się drugi raz', () => {
    expect(xml).not.toContain('<Rozliczenie>');
    expect(xml).not.toContain('<Odliczenia>');
    expect(xml).not.toContain('<DoZaplaty>');
  });

  it('odwołania do zaliczek i kwoty informacyjne zostają', () => {
    expect(xml).toContain('<NrKSeFFaZaliczkowej>5260001246-20260801-ABCDEF123456-01</NrKSeFFaZaliczkowej>');
    expect(xml).toContain('<NrFaZaliczkowej>ZAL/2</NrFaZaliczkowej>');
    expect(xml).toMatch(/<Klucz>Wartość_zamówienia_brutto_PLN<\/Klucz>\s*<Wartosc>37980.00<\/Wartosc>/);
    expect(xml).toMatch(/<Klucz>Rozliczone_zaliczki_brutto_PLN<\/Klucz>\s*<Wartosc>13380.00<\/Wartosc>/);
  });
});

describe('settlementVatSummaries — rozbicie reszty', () => {
  const jednaStawka = [pozycja('Strona WWW', 1, 5000, '23')]; // 5000 + 1150

  it('rozbicie z faktury zaliczkowej ma pierwszeństwo przed wzorem', () => {
    const [s] = settlementVatSummaries(
      jednaStawka.map(toItem),
      [zaliczka({ advance_amount: 1230, vat_rate: '23', net_amount: 1000.01, vat_amount: 229.99 })],
    );
    expect(s).toMatchObject({ rate: '23', netSum: 3999.99, vatSum: 920.01 });
  });

  it('zdarzenie sprzed poprawki (bez stawki): jedna stawka zamówienia + wzór zaliczki', () => {
    const [s] = settlementVatSummaries(jednaStawka.map(toItem), [zaliczka({ advance_amount: 1230 })]);
    expect(s).toMatchObject({ rate: '23', netSum: 4000, vatSum: 920 });
  });

  it('bez stawki przy zamówieniu w kilku stawkach — błąd, nie zgadywanie', () => {
    expect(() => settlementVatSummaries(ZAMOWIENIE.map(toItem), [zaliczka({ advance_amount: 1230 })])).toThrow(
      /kilka stawek/,
    );
  });

  it('zaliczka w stawce, której nie ma w zamówieniu — błąd', () => {
    expect(() =>
      settlementVatSummaries(jednaStawka.map(toItem), [zaliczka({ advance_amount: 1050, vat_rate: '5' })]),
    ).toThrow(/nie ma pozycji w tej stawce/);
  });

  it('zaliczki większe niż zamówienie — błąd', () => {
    expect(() =>
      settlementVatSummaries(jednaStawka.map(toItem), [zaliczka({ advance_amount: 7380, vat_rate: '23' })]),
    ).toThrow(/przekraczają/);
  });

  it('nieznana stawka zaliczki — błąd', () => {
    expect(() =>
      settlementVatSummaries(jednaStawka.map(toItem), [zaliczka({ advance_amount: 100, vat_rate: '22' })]),
    ).toThrow(/nieznana stawka/);
  });
});

describe('settlementRowFromAdvance — wiersz zaliczki z bazy', () => {
  const wiersz = {
    id: '11111111-2222-3333-4444-555555555555',
    internal_number: 'ZAL/7',
    ksef_number: 'KSEF-7',
    issue_date: '2026-08-10',
    advance_amount: '1080.00',
    gross_total: 999,
    net_total: '1000.00',
    vat_total: '80.00',
    fa3_data: { lines: [{ vatRate: '8', netAmount: 1000 }] },
  };

  it('niesie stawkę i rozbicie z faktury zaliczkowej', () => {
    expect(settlementRowFromAdvance(wiersz)).toEqual({
      internal_number: 'ZAL/7',
      ksef_number: 'KSEF-7',
      advance_amount: 1080,
      issue_date: '2026-08-10',
      vat_rate: '8',
      net_amount: 1000,
      vat_amount: 80,
    });
  });

  it('rozbicie, które nie sumuje się do kwoty zaliczki, jest pomijane (generator liczy ze stawki)', () => {
    expect(settlementRowFromAdvance({ ...wiersz, vat_total: '79.00' })).toMatchObject({ net_amount: null, vat_amount: null, vat_rate: '8' });
  });

  it('bez advance_amount bierze brutto; bez numeru — początek id', () => {
    expect(settlementRowFromAdvance({ ...wiersz, advance_amount: null, gross_total: '1080', internal_number: null })).toMatchObject({
      advance_amount: 1080,
      internal_number: '11111111-2222',
    });
  });

  it.each([
    ['brak fa3_data', null],
    ['fa3_data bez pozycji', { lines: [] }],
    ['dwie różne stawki', { lines: [{ vatRate: '23' }, { vatRate: '8' }] }],
    ['stawka nie jest tekstem', { lines: [{ vatRate: 23 }] }],
  ])('stawka nieustalona: %s → null', (_opis, fa3) => {
    expect(advanceVatRate(fa3)).toBeNull();
  });
});

describe('PDF faktury rozliczającej', () => {
  function pdfRoz(o: Partial<Invoice> = {}): Invoice {
    return {
      internalNumber: 'FR/2026/09/1',
      type: 'ROZ',
      issueDate: '2026-09-20',
      seller: { nip: '5260001246', name: 'ACME', address: SELLER.address },
      buyer: { nip: '5252241585', name: 'Klient', address: BUYER.address },
      lines: [toItem(pozycja('Wdrożenie', 1, 5000, '23'))],
      netTotal: 5000,
      vatTotal: 1150,
      grossTotal: 6150,
      payment: { amountDue: 4920, currency: 'PLN', dueDate: '2026-10-04', method: 'transfer' },
      ...o,
    } as Invoice;
  }
  const kwota = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  it.each([
    ['ROZ: reszta po zaliczkach', pdfRoz(), 4920],
    ['zwykła faktura: brutto, nawet gdy amountDue inne', pdfRoz({ type: 'VAT' }), 6150],
    ['ROZ bez poprawnej reszty: brutto (jak dotąd)', pdfRoz({ payment: { amountDue: Number.NaN } as Invoice['payment'] }), 6150],
    ['ROZ z resztą większą niż zamówienie: brutto', pdfRoz({ payment: { amountDue: 7000 } as Invoice['payment'] }), 6150],
  ])('Do zapłaty — %s', (_opis, invoice, oczekiwane) => {
    expect(amountDueOnPdf(invoice)).toBe(oczekiwane);
  });

  it('dopisek z wartością zamówienia i zaliczkami tylko na ROZ', () => {
    expect(settledAdvancesLine(pdfRoz())).toBe(`Wartość zamówienia ${kwota(6150)} PLN, rozliczone zaliczki ${kwota(1230)} PLN`);
    expect(settledAdvancesLine(pdfRoz({ type: 'VAT' }))).toBeNull();
  });

  it('renderer drukuje resztę jako „Do zapłaty” i dopisek o zaliczkach', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await renderInvoicePdf(pdfRoz());
    const wypisane = text.mock.calls.map((c) => String(c[0]));
    text.mockRestore();
    expect(wypisane).toContain(`Do zapłaty: ${kwota(4920)} PLN`);
    expect(wypisane).not.toContain(`Do zapłaty: ${kwota(6150)} PLN`);
    expect(wypisane).toContain(`Wartość zamówienia ${kwota(6150)} PLN, rozliczone zaliczki ${kwota(1230)} PLN`);
    expect(wypisane).toContain('PODSUMOWANIE VAT ZAMÓWIENIA');
  });
});

function toItem(line: InvoiceLine) {
  const net = Math.round(line.quantity * line.unitPriceNet * 100) / 100;
  const rate = line.vatRate === '23' ? 0.23 : line.vatRate === '8' ? 0.08 : line.vatRate === '5' ? 0.05 : 0;
  const vat = Math.round(net * rate * 100) / 100;
  return {
    ordinal: 1,
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
    unitPriceNet: line.unitPriceNet,
    vatRate: line.vatRate,
    netAmount: net,
    vatAmount: vat,
    grossAmount: Math.round((net + vat) * 100) / 100,
  };
}
