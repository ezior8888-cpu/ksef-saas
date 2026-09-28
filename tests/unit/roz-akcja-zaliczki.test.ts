import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ db: vi.fn(), enqueue: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.db() }));
vi.mock('@/lib/supabase/active-org', () => ({ getActiveOrgIdFromCookies: async () => 'firma-a' }));
vi.mock('@/lib/invoices/ksef-submit-enqueue', () => ({ enqueueKsefSubmitAfterDraft: mocks.enqueue }));
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn() }));

import { saveAndSendFinalAction } from '@/components/invoices/final-actions';
import { generateFinalInvoiceXml } from '@/lib/ksef/fa3-advance-generator';

/**
 * Akcja „Wystaw i wyślij” faktury rozliczającej: wiersze zaliczek muszą nieść
 * stawkę i rozbicie z faktur zaliczkowych (ROZ odejmuje je w P_13_x/P_14_x),
 * a zaliczka, której nie da się odjąć, wraca do formularza PRZED zapisem.
 */

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let inserts: Array<{ table: string; value: unknown }>;

function database() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      const predicates: Array<(r: Row) => boolean> = [];
      let columns: string[] | null = null;
      let singular = false;
      let inserted: Row | null = null;
      const query = {
        select(selection = '*') {
          const parts = selection.split(',').map((s) => s.trim()).filter(Boolean);
          columns = parts.includes('*') ? null : parts;
          return query;
        },
        insert(value: Row | Row[]) {
          inserts.push({ table, value });
          inserted = Array.isArray(value) ? null : { id: 'roz-nowa', ...value };
          return query;
        },
        delete() { return query; },
        eq(k: string, v: unknown) { predicates.push((r) => r[k] === v); return query; },
        in(k: string, vs: unknown[]) { predicates.push((r) => vs.includes(r[k])); return query; },
        single() { singular = true; return query; },
        maybeSingle() { singular = true; return query; },
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
          const project = (r: Row): Row => (columns ? Object.fromEntries(columns.map((c) => [c, r[c]])) : r);
          const rows = inserted ? [inserted] : (tables[table] ?? []).filter((r) => predicates.every((p) => p(r)));
          const data = rows.map(project);
          return Promise.resolve({ data: singular ? data[0] ?? null : data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

const ZAL_23 = '11111111-1111-4111-8111-111111111111';
const ZAL_8 = '22222222-2222-4222-8222-222222222222';
const ZAL_5 = '33333333-3333-4333-8333-333333333333';

function zaliczka(id: string, gross: number, net: number, vat: number, rate: string): Row {
  return {
    id, tenant_id: 'firma-a', direction: 'outgoing', ksef_status: 'accepted', invoice_kind: 'advance',
    internal_number: `ZAL/${rate}`, ksef_number: null, issue_date: '2026-08-01',
    advance_amount: gross, gross_total: gross, net_total: net, vat_total: vat,
    fa3_data: { lines: [{ vatRate: rate, netAmount: net }] },
  };
}

function formularz(advanceInvoiceIds: string[], totalAdvances: number) {
  return {
    invoiceType: 'final',
    internalNumber: 'FR/2026/09/1',
    issueDate: '2026-09-20',
    paymentMethod: 'transfer',
    paymentDueDate: '2026-10-04',
    bankAccount: '61109010140000071219812874',
    seller: { nip: '5260001246', name: 'ACME', address: { addressLine1: 'ul. A 1', addressLine2: '00-001 Warszawa', countryCode: 'PL' } },
    buyer: { type: 'b2b', idType: 'nip', nip: '5252241585', name: 'Klient', address: { addressLine1: 'ul. K 10', addressLine2: '02-001 Warszawa', countryCode: 'PL' } },
    advanceInvoiceIds,
    totalAdvances,
    // Dwie stawki — bez stawki zaliczki z bazy rozbicie musiałoby się wywrócić.
    lines: [
      { name: 'Wdrożenie', unit: 'usł.', quantity: 3, unitPriceNet: 10000, vatRate: '23' },
      { name: 'Szkolenie', unit: 'usł.', quantity: 1, unitPriceNet: 1000, vatRate: '8' },
    ],
  };
}

beforeEach(() => {
  tables = {
    tenants: [{ id: 'firma-a', nip: '5260001246', name: 'ACME', address_json: null }],
    invoices: [
      zaliczka(ZAL_23, 12300, 10000, 2300, '23'),
      zaliczka(ZAL_8, 1080, 1000, 80, '8'),
      zaliczka(ZAL_5, 1050, 1000, 50, '5'),
    ],
  };
  inserts = [];
  mocks.db.mockReset().mockImplementation(database);
  mocks.enqueue.mockReset().mockResolvedValue({ ok: true, mode: 'queued' });
});

describe('saveAndSendFinalAction — zaliczki ze stawką', () => {
  it('kolejka dostaje wiersze zaliczek ze stawką i rozbiciem; XML z nich ma resztę', async () => {
    const wynik = await saveAndSendFinalAction(formularz([ZAL_23, ZAL_8], 13380));
    expect(wynik).toMatchObject({ success: true });

    const arg = mocks.enqueue.mock.calls[0][0];
    expect(arg.finalAdvanceSettlementRows).toEqual([
      expect.objectContaining({ advance_amount: 12300, vat_rate: '23', net_amount: 10000, vat_amount: 2300 }),
      expect.objectContaining({ advance_amount: 1080, vat_rate: '8', net_amount: 1000, vat_amount: 80 }),
    ]);

    const xml = generateFinalInvoiceXml(arg.finalData, arg.finalAdvanceSettlementRows);
    expect(xml).toContain('<P_13_1>20000.00</P_13_1>');
    expect(xml).toContain('<P_14_1>4600.00</P_14_1>');
    expect(xml).toContain('<P_15>24600.00</P_15>');
  });

  it('zaliczka w stawce spoza zamówienia wraca do formularza — bez szkicu i bez wysyłki', async () => {
    const wynik = await saveAndSendFinalAction(formularz([ZAL_23, ZAL_5], 13350));
    expect(wynik).toMatchObject({ success: false });
    expect((wynik as { error: string }).error).toMatch(/nie ma pozycji w tej stawce/);
    expect(inserts).toEqual([]);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
