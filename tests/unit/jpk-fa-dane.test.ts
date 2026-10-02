import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));

import type { SupabaseClient } from '@supabase/supabase-js';

import { annotationsFromFa3, fetchInvoicesForExport } from '@/lib/exports/data-fetcher';
import { fetchAdvanceSettlementRows } from '@/lib/invoices/advance-settlement';

/**
 * Dane do JPK_FA(4) z bazy: adnotacje (P_16/P_18A/P_19A), VAT pozycji
 * (P_14 co do grosza) i zaliczki faktury rozliczeniowej (P_13/P_14/P_15 po
 * odjęciu, NrFaZaliczkowej).
 */

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let failAdvances = false;

function database() {
  return {
    from(table: string) {
      const predicates: Array<(r: Row) => boolean> = [];
      const filters: Array<[string, unknown]> = [];
      let columns: string[] | null = null;
      let singular = false;
      let window: [number, number] | null = null;
      let head = false;
      const query = {
        // Tylko wybrane kolumny — brak kolumny w zapytaniu ma być widoczny.
        select(selection = '*', options?: { head?: boolean }) {
          const parts = selection.split(',').map((s) => s.trim()).filter(Boolean);
          columns = parts.some((p) => p === '*' || /[():]/.test(p)) ? null : parts;
          head = Boolean(options?.head);
          return query;
        },
        // Kontrola proweniencji (#63): przyjęte faktury bez środowiska KSeF.
        or(expr: string) {
          const m = /^ksef_environment\.is\.null,ksef_environment\.neq\.(test|demo|production)$/.exec(expr);
          if (!m) throw new Error(`Unexpected OR filter ${expr}`);
          predicates.push((r) => r.ksef_environment == null || r.ksef_environment !== m[1]);
          return query;
        },
        eq(k: string, v: unknown) { filters.push([k, v]); predicates.push((r) => r[k] === v); return query; },
        in(k: string, vs: unknown[]) { predicates.push((r) => vs.includes(r[k])); return query; },
        gte(k: string, v: string) { predicates.push((r) => String(r[k]) >= v); return query; },
        lte(k: string, v: string) { predicates.push((r) => String(r[k]) <= v); return query; },
        gt(k: string, v: string) { predicates.push((r) => String(r[k]) > v); return query; },
        order() { return query; },
        limit() { return query; },
        range(a: number, b: number) { window = [a, b]; return query; },
        single() { singular = true; return query; },
        maybeSingle() { singular = true; return query; },
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
          if (failAdvances && table === 'invoices' && filters.some(([k, v]) => k === 'invoice_kind' && v === 'advance')) {
            return Promise.resolve({ data: null, error: { message: 'awaria' } }).then(resolve, reject);
          }
          const project = (r: Row): Row => (columns ? Object.fromEntries(columns.map((c) => [c, r[c]])) : r);
          const matching = (tables[table] ?? []).filter((r) => predicates.every((p) => p(r)));
          const rows = (window ? matching.slice(window[0], window[1] + 1) : matching).map(project);
          return Promise.resolve({ data: head ? null : singular ? rows[0] ?? null : rows, count: matching.length, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function faktura(o: Row): Row {
  return {
    tenant_id: 'firma-a', direction: 'outgoing', invoice_kind: 'regular', ksef_status: 'accepted', ksef_environment: 'test',
    issue_date: '2026-09-10', net_total: 0, vat_total: 0, gross_total: 0, advance_invoice_ids: [],
    fa3_data: null, buyer_data: { name: 'Klient' }, seller_data: null, internal_number: null, ksef_number: null,
    ...o,
  };
}

const zaliczka = (id: string, o: Row = {}) =>
  faktura({
    id, internal_number: id.toUpperCase(), invoice_kind: 'advance', issue_date: '2026-08-01',
    advance_amount: 1230, gross_total: 1230, net_total: 1000, vat_total: 230,
    fa3_data: { lines: [{ vatRate: '23', netAmount: 1000, vatAmount: 230 }] },
    ...o,
  });

beforeEach(() => {
  tables = { tenants: [{ id: 'firma-a', nip: '5260001246', name: 'ACME', address_json: null }], invoices: [], invoice_line_items: [], expenses: [] };
  failAdvances = false;
  mocks.admin.mockReset().mockImplementation(database);
});

describe('annotationsFromFa3', () => {
  it.each([
    ['MPP i metoda kasowa (1 → true)', { annotations: { splitPayment: 1, cashMethod: 1 } }, { splitPayment: true, cashMethod: true }],
    ['podstawa zwolnienia (przycięta)', { annotations: { vatExemptionBasis: '  art. 113  ' } }, { vatExemptionBasis: 'art. 113' }],
    ['2 to „nie” — nie true', { annotations: { splitPayment: 2, cashMethod: 2 } }, undefined],
    ['brak gałęzi', { lines: [] }, undefined],
    ['nie obiekt', null, undefined],
  ])('%s', (_opis, fa3, oczekiwane) => {
    expect(annotationsFromFa3(fa3 as never)).toEqual(oczekiwane);
  });
});

describe('fetchAdvanceSettlementRows', () => {
  const client = () => database() as unknown as SupabaseClient;

  it('zaliczki tej firmy, przyjęte przez KSeF, w kolejności z advance_invoice_ids, bez dubli', async () => {
    tables.invoices.push(
      zaliczka('zal-1'),
      zaliczka('zal-2', { advance_amount: 615, gross_total: 615, net_total: 500, vat_total: 115 }),
      zaliczka('zal-odrzucona', { ksef_status: 'rejected' }),
      zaliczka('zal-cudza', { tenant_id: 'firma-b' }),
      faktura({ id: 'zwykla', internal_number: 'FV/9' }),
    );
    const wynik = await fetchAdvanceSettlementRows(client(), 'firma-a', [
      { id: 'roz', invoice_kind: 'final', advance_invoice_ids: ['zal-2', 'zal-1', 'zal-2', 'zal-odrzucona', 'zal-cudza', 'zwykla'] },
      { id: 'fv', invoice_kind: 'regular', advance_invoice_ids: ['zal-1'] },
    ]);
    expect([...wynik.keys()]).toEqual(['roz']);
    expect(wynik.get('roz')).toEqual([
      expect.objectContaining({ internal_number: 'ZAL-2', advance_amount: 615, vat_rate: '23', net_amount: 500, vat_amount: 115 }),
      expect.objectContaining({ internal_number: 'ZAL-1', advance_amount: 1230, vat_rate: '23', net_amount: 1000, vat_amount: 230 }),
    ]);
  });

  it('błąd odczytu rzuca — „zero zaliczek” zawyżyłoby P_13/P_14/P_15', async () => {
    failAdvances = true;
    await expect(
      fetchAdvanceSettlementRows(client(), 'firma-a', [{ id: 'roz', invoice_kind: 'final', advance_invoice_ids: ['zal-1'] }]),
    ).rejects.toThrow(/zaliczek/);
  });
});

describe('fetchInvoicesForExport — dane do JPK_FA', () => {
  it('ROZ dostaje wiersze zaliczek; faktury — adnotacje; pozycje z tabeli — VAT pozycji', async () => {
    tables.invoices.push(
      zaliczka('zal-1'),
      faktura({
        id: 'roz', internal_number: 'ROZ/1', invoice_kind: 'final', net_total: 5000, vat_total: 1150, gross_total: 6150,
        advance_invoice_ids: ['zal-1'],
        fa3_data: { lines: [{ ordinal: 1, name: 'Strona', unit: 'usł.', quantity: 1, unitPriceNet: 5000, netAmount: 5000, vatRate: '23', vatAmount: 1150 }] },
      }),
      faktura({
        id: 'fv', internal_number: 'FV/1', net_total: 1000, vat_total: 230.01, gross_total: 1230.01,
        fa3_data: { annotations: { splitPayment: 1 } },
      }),
    );
    tables.invoice_line_items.push({
      invoice_id: 'fv', ordinal: 1, name: 'Usługa', unit: 'szt.', quantity: 1, unit_price_net: 1000, net_amount: 1000,
      vat_rate: '23', vat_amount: 230.01,
    });

    const dane = await fetchInvoicesForExport({ tenantId: 'firma-a', periodStart: '2026-09-01', periodEnd: '2026-09-30', direction: 'issued' });
    const po = new Map(dane.issuedInvoices.map((i) => [i.invoiceNumber, i]));

    expect(po.get('ROZ/1')?.advanceSettlement).toEqual([
      expect.objectContaining({ internal_number: 'ZAL-1', vat_rate: '23', net_amount: 1000, vat_amount: 230 }),
    ]);
    expect(po.get('ROZ/1')?.lines[0]).toMatchObject({ vatAmount: 1150 });
    expect(po.get('FV/1')?.annotations).toEqual({ splitPayment: true });
    expect(po.get('FV/1')?.lines[0]).toMatchObject({ vatAmount: 230.01 });
    expect(po.get('FV/1')?.advanceSettlement).toBeUndefined();
  });
});
