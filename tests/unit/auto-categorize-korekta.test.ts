import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  invoice: null as Row | null,
  inserts: [] as Row[],
  categorized: [] as Row[],
}));

vi.mock('@/lib/categorization', () => ({
  categorizeExpense: async (_tenantId: string, extracted: Row) => {
    db.categorized.push(extracted);
    return { kpir_column: 'col_13', category_label: 'Usługi', method: 'rule', confidence: 0.95 };
  },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      let insertRow: Row | null = null;
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        limit: () => q,
        insert: (r: Row) => {
          insertRow = r;
          db.inserts.push(r);
          return q;
        },
        single: async () => {
          if (table === 'invoices') return { data: db.invoice, error: null };
          return { data: insertRow ? { id: 'exp-1' } : null, error: null };
        },
        maybeSingle: async () => {
          if (table === 'memberships') return { data: { user_id: 'u-1' }, error: null };
          return { data: null, error: null };
        },
      });
      return q;
    },
  }),
}));

import { runAutoCategorizeInbox } from '@/lib/inngest/jobs/auto-categorize-inbox';

/**
 * Korekta zakupu „in minus” ze skrzynki KSeF (dostawca obniża cenę) ma ujemne
 * kwoty. Do 27.09 auto-kategoryzacja ją pomijała („brak dodatniej kwoty”),
 * więc koszt w KPiR i VAT do odliczenia zostawały zawyżone — a po #58 eksport
 * KPiR/JPK liczy koszty wyłącznie z wydatków.
 */

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};
const DANE = {
  invoiceId: '11111111-1111-4111-8111-111111111111',
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

// Tak zapisuje skrzynka (inbox-polling): kwoty z metadanych KSeF, bez pozycji.
function faktura(o: Row): Row {
  return {
    id: DANE.invoiceId,
    tenant_id: DANE.tenantId,
    direction: 'incoming',
    ksef_number: '5260001246-20260925-000000000001-00',
    internal_number: 'KOR 1/09/2026',
    issue_date: '2026-09-25',
    seller_data: null,
    seller_nip: '5260001246',
    fa3_data: { _source: 'inbox-metadata', invoiceType: 'Kor', seller: { name: 'Dostawca', nip: '5260001246' } },
    invoice_line_items: [],
    ...o,
  };
}

beforeEach(() => {
  db.inserts = [];
  db.categorized = [];
});

describe('korekta zakupu „in minus” ze skrzynki KSeF', () => {
  it('powstaje ujemny koszt — obniża KPiR i VAT do odliczenia', async () => {
    db.invoice = faktura({ gross_total: -123, net_total: -100, vat_total: -23 });
    await runAutoCategorizeInbox(DANE, ctx);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({
      net_amount: -100,
      vat_amount: -23,
      gross_amount: -123,
      vat_deductible_amount: -23,
      vat_rate: '23',
      document_number: 'KOR 1/09/2026',
    });
  });

  it('kategoryzacja dostaje kwoty bez znaku (progi reguł jak dla faktury)', async () => {
    db.invoice = faktura({ gross_total: -123, net_total: -100, vat_total: -23 });
    await runAutoCategorizeInbox(DANE, ctx);
    expect(db.categorized[0]).toMatchObject({ net_amount: 100, vat_amount: 23, gross_amount: 123 });
  });

  it('zwykła faktura bez zmian', async () => {
    db.invoice = faktura({ internal_number: 'FV 1/2026', gross_total: 123, net_total: 100, vat_total: 23 });
    await runAutoCategorizeInbox(DANE, ctx);
    expect(db.inserts[0]).toMatchObject({ net_amount: 100, vat_amount: 23, gross_amount: 123, vat_deductible_amount: 23 });
  });

  it('zerowa kwota — nadal pomijamy, bez zapisu', async () => {
    db.invoice = faktura({ gross_total: 0, net_total: 0, vat_total: 0 });
    await expect(runAutoCategorizeInbox(DANE, ctx)).rejects.toThrow(/Brak kwoty brutto/);
    expect(db.inserts).toEqual([]);
  });
});
