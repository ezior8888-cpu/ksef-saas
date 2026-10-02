import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  generateAdvanceInvoiceXml,
  generateFinalInvoiceXml,
  type AdvanceInvoiceSettlementRow,
} from '@/lib/ksef/fa3-advance-generator';
import { validateInvoiceXml } from '@/lib/xml/validator';
import type { AdvanceInvoiceData, FinalInvoiceData } from '@/types/invoice-types';

/**
 * Partia 15 audytu (ZAL/ROZ): AUD-23 (adnotacje P_16/P_18A w ROZ), AUD-67
 * (ta sama zaliczka w dwóch ROZ), AUD-71 (`Zamowienie` w ZAL), AUD-95
 * („pozostało do rozliczenia” bez wcześniejszych zaliczek).
 * Fikcyjne NIP-y — XSD sprawdza tylko format.
 */

const address = { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' };
const seller = { nip: '1234567890', name: 'Sprzedawca testowy', address };
const buyer = {
  type: 'b2b' as const, idType: 'nip' as const, nip: '1234567890', name: 'Nabywca testowy', address,
};

function zal(overrides: Partial<AdvanceInvoiceData> = {}): AdvanceInvoiceData {
  return {
    invoiceType: 'advance',
    internalNumber: 'ZAL/2026/10/1',
    issueDate: '2026-10-02',
    paymentMethod: 'transfer',
    paymentDueDate: '2026-10-16',
    bankAccount: '1'.repeat(26),
    seller,
    buyer,
    taxAnnotations: { cashMethod: 2, splitPayment: 2 },
    advanceAmount: 1230,
    totalContractAmount: 12300,
    vatRate: '23',
    description: 'Projekt strony internetowej',
    ...overrides,
  };
}

function roz(overrides: Partial<FinalInvoiceData> = {}): FinalInvoiceData {
  return {
    invoiceType: 'final',
    internalNumber: 'ROZ/2026/10/1',
    issueDate: '2026-10-02',
    paymentMethod: 'transfer',
    paymentDueDate: '2026-10-16',
    bankAccount: '1'.repeat(26),
    seller,
    buyer,
    taxAnnotations: { cashMethod: 2, splitPayment: 2 },
    advanceInvoiceIds: ['00000000-0000-4000-8000-000000000001'],
    totalAdvances: 1230,
    lines: [{ name: 'Projekt strony internetowej', unit: 'usł.', quantity: 1, unitPriceNet: 10000, vatRate: '23' }],
    ...overrides,
  };
}

const advances: AdvanceInvoiceSettlementRow[] = [{
  internal_number: 'ZAL/2026/10/1', ksef_number: '1234567890-20261002-ABCDEF123456-01',
  advance_amount: 1230, issue_date: '2026-10-02', vat_rate: '23', net_amount: 1000, vat_amount: 230,
}];

async function expectValid(xml: string): Promise<void> {
  const result = await validateInvoiceXml(xml);
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
}

describe('AUD-23: ROZ niesie metodę kasową i MPP firmy', () => {
  it.each([
    ['metoda kasowa i MPP', { cashMethod: 1, splitPayment: 1 } as const, '<P_16>1</P_16>', '<P_18A>1</P_18A>'],
    ['zwykły VAT bez MPP', { cashMethod: 2, splitPayment: 2 } as const, '<P_16>2</P_16>', '<P_18A>2</P_18A>'],
  ])('%s — P_16/P_18A z koperty, XML zgodny z XSD', async (_label, flags, p16, p18a) => {
    const xml = generateFinalInvoiceXml(roz({ taxAnnotations: flags }), advances);
    expect(xml).toContain(p16);
    expect(xml).toContain(p18a);
    await expectValid(xml);
  });

  it('bez zamrożonych adnotacji nie zgaduje „2” — rzuca', () => {
    expect(() => generateFinalInvoiceXml(
      roz({ taxAnnotations: undefined as unknown as FinalInvoiceData['taxAnnotations'] }),
      advances,
    )).toThrow('P_16/P_18A');
  });

  it('MPP bez przelewu na rachunek — rzuca', () => {
    expect(() => generateFinalInvoiceXml(
      roz({ taxAnnotations: { cashMethod: 2, splitPayment: 1 }, paymentMethod: 'cash', bankAccount: undefined }),
      advances,
    )).toThrow('MPP');
  });
});

describe('AUD-71: ZAL ma strukturę Zamowienie (art. 106f ust. 1 pkt 4)', () => {
  it('wartość zamówienia brutto i pozycja z nazwą, ilością, ceną, podatkiem i stawką', async () => {
    const xml = generateAdvanceInvoiceXml(zal());
    const zamowienie = xml.match(/<Zamowienie>[\s\S]*<\/Zamowienie>/)?.[0] ?? '';
    expect(zamowienie).toContain('<WartoscZamowienia>12300.00</WartoscZamowienia>');
    expect(zamowienie).toContain('<NrWierszaZam>1</NrWierszaZam>');
    expect(zamowienie).toContain('<P_7Z>Projekt strony internetowej</P_7Z>');
    expect(zamowienie).toContain('<P_8BZ>1.0000</P_8BZ>');
    expect(zamowienie).toContain('<P_9AZ>10000.0000</P_9AZ>');
    expect(zamowienie).toContain('<P_11NettoZ>10000.00</P_11NettoZ>');
    expect(zamowienie).toContain('<P_11VatZ>2300.00</P_11VatZ>');
    expect(zamowienie).toContain('<P_12Z>23</P_12Z>');
    await expectValid(xml);
  });

  it.each(['23', '8', '5', '0'] as const)('stawka %s — netto + VAT = wartość zamówienia, XSD przechodzi', async (vatRate) => {
    const xml = generateAdvanceInvoiceXml(zal({ vatRate, totalContractAmount: 9999.99, advanceAmount: 100 }));
    const netto = Number(xml.match(/<P_11NettoZ>([\d.]+)<\/P_11NettoZ>/)?.[1]);
    const vat = Number(xml.match(/<P_11VatZ>([\d.]+)<\/P_11VatZ>/)?.[1]);
    expect(Math.round((netto + vat) * 100)).toBe(999999);
    await expectValid(xml);
  });
});

describe('AUD-95: ZAL nie podaje „pozostało do rozliczenia”', () => {
  it('kwoty nie da się policzyć bez wcześniejszych zaliczek tej umowy — pole znika', () => {
    const xml = generateAdvanceInvoiceXml(zal());
    expect(xml).not.toContain('Pozostało_do_rozliczenia');
    expect(xml).toContain('Wartość_umowy_całkowita_PLN');
  });
});

describe('AUD-67: migracja 00125 — zaliczka rozliczona najwyżej jedną ROZ', () => {
  const sql = readFileSync('supabase/migrations/00125_roz_advance_single_settlement.sql', 'utf8');

  it('wyzwalacz na wstawieniu i zmianie listy zaliczek, rodzaju, firmy i statusu', () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF advance_invoice_ids, invoice_kind, tenant_id, ksef_status\s+ON public\.invoices/);
    expect(sql).toContain('FOR EACH ROW EXECUTE FUNCTION public.guard_roz_advance_single_settlement()');
  });

  it('odrzucona ROZ zwalnia zaliczki; konkurencyjne zapisy firmy serializowane', () => {
    expect(sql).toContain("NEW.ksef_status = 'rejected'");
    expect(sql).toContain("i.ksef_status IS DISTINCT FROM 'rejected'");
    expect(sql).toContain('i.advance_invoice_ids && NEW.advance_invoice_ids');
    expect(sql).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(sql).toContain("USING ERRCODE = '23505'");
  });

  it('funkcja jako wywołujący (RLS widzi tylko własną firmę), bez zmian danych', () => {
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain("SET search_path = ''");
    const outsideBodies = sql.replace(/\$\$[\s\S]*?\$\$/g, '');
    expect(outsideBodies).not.toMatch(/\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+public\.|DROP\s+(TABLE|COLUMN))\b/i);
  });
});
