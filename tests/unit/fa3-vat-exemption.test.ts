import { describe, expect, it } from 'vitest';

import { generateFA3Xml, InvoiceValidationError } from '@/lib/xml/fa3-generator';
import { finalizeInvoice, validateInvoice, ZW_WITHOUT_BASIS_MESSAGE, type InvoiceInput } from '@/lib/xml/invoice-calculator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import { normalizeExemptionBasis, readTenantVatExemption } from '@/lib/invoices/vat-exemption';
import type { Invoice } from '@/types/invoice';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Zwolnienie z VAT w FA(3). Do 26.09 firma zwolniona (art. 113 — typowa
 * mikrofirma) nie mogła wystawić poprawnej faktury: formularz nie miał „zw”,
 * generator rzucał błędem. XSD: Zwolnienie = (P_19=1 + P_19A|B|C) albo P_19N=1.
 */

const BASIS = 'art. 113 ust. 1 ustawy o VAT';

/**
 * Faktura jak z `buildInvoiceFromForm`: adnotacje (w tym P_19A) dopina się do
 * GOTOWEJ faktury — `InvoiceInput`/`finalizeInvoice` ich nie znają.
 */
function faktura(o: Partial<InvoiceInput> = {}, annotations: Invoice['annotations'] = { vatExemptionBasis: BASIS }): Invoice {
  return { ...finalizeInvoice(wejscie(o)), annotations };
}

function wejscie(o: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    internalNumber: 'FV 1/09/2026',
    type: 'VAT',
    issueDate: '2026-09-26',
    saleDate: '2026-09-26',
    seller: {
      nip: '5260001246',
      name: 'Jan Kowalski Usługi',
      address: { countryCode: 'PL', addressLine1: 'ul. Przykładowa 1', addressLine2: '00-001 Warszawa' },
    },
    buyer: {
      nip: '5252241585',
      name: 'Klient Sp. z o.o.',
      address: { countryCode: 'PL', addressLine1: 'ul. Klienta 10', addressLine2: '02-001 Warszawa' },
    },
    lines: [{ ordinal: 1, name: 'Usługa programistyczna', unit: 'godz.', quantity: 10, unitPriceNet: 150, vatRate: 'zw' }],
    payment: { currency: 'PLN', dueDate: '2026-10-10', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
    ...o,
  };
}

describe('FA(3) — sprzedaż zwolniona', () => {
  it('„zw” z podstawą: P_19=1 + P_19A, bez P_19N — i PRZECHODZI oficjalny XSD', async () => {
    const xml = generateFA3Xml(faktura());

    expect(xml).toContain('<P_19>1</P_19>');
    expect(xml).toContain(`<P_19A>${BASIS}</P_19A>`);
    expect(xml).not.toContain('<P_19N>');
    expect(xml).toContain('<P_13_7>1500.00</P_13_7>');

    const wynik = await validateInvoiceXml(xml);
    expect(wynik.errors).toEqual([]);
    expect(wynik.valid).toBe(true);
  });

  it('pozycja 23% i pozycja zwolniona przedmiotowo na jednej fakturze — też zgodna z XSD', async () => {
    const xml = generateFA3Xml(
      faktura(
        {
          lines: [
            { ordinal: 1, name: 'Towar', unit: 'szt.', quantity: 1, unitPriceNet: 100, vatRate: '23' },
            { ordinal: 2, name: 'Szkolenie', unit: 'usł.', quantity: 1, unitPriceNet: 200, vatRate: 'zw' },
          ],
        },
        { vatExemptionBasis: 'art. 43 ust. 1 pkt 29 lit. c ustawy o VAT' },
      ),
    );
    expect((await validateInvoiceXml(xml)).valid).toBe(true);
  });

  it('bez „zw” nic się nie zmienia: P_19N=1, podstawa ignorowana', () => {
    const xml = generateFA3Xml(
      faktura({ lines: [{ ordinal: 1, name: 'Towar', unit: 'szt.', quantity: 1, unitPriceNet: 100, vatRate: '23' }] }),
    );
    expect(xml).toContain('<P_19N>1</P_19N>');
    expect(xml).not.toContain('<P_19A>');
  });

  it('„zw” bez podstawy: czytelny błąd walidacji zamiast wywrotki generatora', () => {
    const invoice = faktura({}, {});
    expect(validateInvoice(invoice)).toContain(ZW_WITHOUT_BASIS_MESSAGE);
    expect(() => generateFA3Xml(invoice)).toThrow(InvoiceValidationError);
  });

  it('bezpiecznik generatora: bez walidacji też nie wyjdzie P_19 z pustą podstawą', () => {
    expect(() => generateFA3Xml(faktura({}, {}), { validate: false })).toThrow(InvoiceValidationError);
  });
});

describe('podstawa zwolnienia — ustawienie firmy', () => {
  it('czyści, a puste traktuje jako „czynny podatnik”', () => {
    expect(normalizeExemptionBasis('  art.  113 ust. 1  ustawy o VAT ')).toBe('art. 113 ust. 1 ustawy o VAT');
    expect(normalizeExemptionBasis('')).toBeNull();
    expect(normalizeExemptionBasis(null)).toBeNull();
  });

  it('odrzuca śmieci — te same granice co CHECK w 00091', () => {
    expect(() => normalizeExemptionBasis('ab')).toThrow();
    expect(() => normalizeExemptionBasis('x'.repeat(257))).toThrow();
    expect(() => normalizeExemptionBasis('art. <script>')).toThrow();
  });

  function klient(wynik: { data: unknown; error: { code?: string; message: string } | null }) {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => wynik };
    return { from: () => q } as unknown as SupabaseClient;
  }

  it('przed migracją (brak kolumny, 42703) = „nie zwolniona”, a nie wywrócona strona', async () => {
    await expect(readTenantVatExemption(klient({ data: null, error: { code: '42703', message: 'column does not exist' } }), 't')).resolves.toBeNull();
  });

  it('każdy inny błąd odczytu rzuca — błąd to nie „czynny podatnik”', async () => {
    await expect(readTenantVatExemption(klient({ data: null, error: { code: 'XX000', message: 'boom' } }), 't')).rejects.toThrow();
  });

  it('odczytuje ustawioną podstawę', async () => {
    await expect(readTenantVatExemption(klient({ data: { vat_exemption_basis: BASIS }, error: null }), 't')).resolves.toBe(BASIS);
  });
});
