import PDFDocument from 'pdfkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderInvoicePdf } from '@/lib/pdf/invoice-renderer';
import { finalizeInvoice, type InvoiceInput } from '@/lib/xml/invoice-calculator';

/**
 * F-054 (audyt bloku 1): tabela pozycji na PDF.
 *  - Etykiety nagłówka rysowały się od `doc.y + 6`, a `doc.y` przesuwał się po
 *    każdej etykiecie — kolumny schodziły po skosie na KAŻDEJ fakturze.
 *  - Wiersze miały stałe 20 pt i nie było łamania strony: od ok. 22 pozycji
 *    pdfkit dokładał stronę na każdą komórkę (40 pozycji → 149 stron).
 *  - Długa nazwa zawijała się i nachodziła na następny wiersz.
 */

const NAGLOWEK = ['Lp', 'Nazwa towaru / usługi', 'Ilość', 'j.m.', 'Cena netto', 'Wartość netto', 'VAT', 'Brutto'];

function faktura(liczbaPozycji: number, nazwa: (i: number) => string = (i) => `Usługa ${i}`) {
  const input: InvoiceInput = {
    internalNumber: 'FV 7/10/2026',
    type: 'VAT',
    issueDate: '2026-10-01',
    saleDate: '2026-10-01',
    seller: {
      nip: '5260001246',
      name: 'Moja Firma Sp. z o.o.',
      address: { countryCode: 'PL', addressLine1: 'ul. Przykładowa 1', addressLine2: '00-001 Warszawa' },
    },
    buyer: {
      nip: '5252241585',
      name: 'Klient Sp. z o.o.',
      address: { countryCode: 'PL', addressLine1: 'ul. Klienta 10', addressLine2: '02-001 Warszawa' },
    },
    lines: Array.from({ length: liczbaPozycji }, (_, i) => ({
      ordinal: i + 1,
      name: nazwa(i + 1),
      unit: 'usł.',
      quantity: 1,
      unitPriceNet: 100,
      vatRate: '23' as const,
    })),
    payment: { currency: 'PLN', dueDate: '2026-10-15', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
  };
  return finalizeInvoice(input);
}

function liczbaStron(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length;
}

const dlugaNazwa = (i: number) =>
  `Pozycja ${i}: wdrożenie modułu fakturowania z integracją KSeF, szkolenie zespołu księgowego, konfiguracja uprawnień i migracja danych z poprzedniego systemu`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PDF — tabela pozycji (F-054)', () => {
  it('etykiety nagłówka leżą w jednym wierszu (ta sama współrzędna Y)', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await renderInvoicePdf(faktura(1));
    const ys = text.mock.calls
      .filter((c) => NAGLOWEK.includes(String(c[0])))
      .map((c) => Number(c[2]));
    expect(ys).toHaveLength(NAGLOWEK.length);
    expect(new Set(ys).size).toBe(1);
  });

  it('jedna pozycja mieści się na jednej stronie', async () => {
    expect(liczbaStron(await renderInvoicePdf(faktura(1)))).toBe(1);
  });

  it('40 krótkich pozycji to najwyżej 3 strony, z nagłówkiem powtórzonym na każdej', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    const pdf = await renderInvoicePdf(faktura(40));
    const strony = liczbaStron(pdf);
    expect(strony).toBeGreaterThanOrEqual(2);
    expect(strony).toBeLessThanOrEqual(3);
    const naglowkiNazwy = text.mock.calls.filter((c) => String(c[0]) === 'Nazwa towaru / usługi');
    expect(naglowkiNazwy).toHaveLength(strony);
  });

  it('60 pozycji z długimi nazwami: rozsądna liczba stron, wiersze nie nachodzą na siebie', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    const pdf = await renderInvoicePdf(faktura(60, dlugaNazwa));
    expect(liczbaStron(pdf)).toBeLessThanOrEqual(12);

    // Kolejne nazwy pozycji: każda zaczyna się niżej niż poprzednia na tej
    // samej stronie (albo na nowej stronie wyżej) — nigdy w tym samym miejscu.
    const nazwy = text.mock.calls
      .filter((c) => String(c[0]).startsWith('Pozycja '))
      .map((c) => Number(c[2]));
    expect(nazwy).toHaveLength(60);
    for (let i = 1; i < nazwy.length; i += 1) {
      expect(nazwy[i]).not.toBe(nazwy[i - 1]);
    }
  });

  it('podsumowanie i „Do zapłaty” są drukowane także przy długiej fakturze', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await renderInvoicePdf(faktura(40));
    const printed = text.mock.calls.map((c) => String(c[0]));
    expect(printed.some((t) => t.startsWith('Do zapłaty:'))).toBe(true);
    expect(printed).toContain('PODSUMOWANIE VAT');
  });
});
