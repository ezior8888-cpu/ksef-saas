import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  existing: null as Row | null,
  existingError: null as { message: string } | null,
  inserts: [] as Row[],
}));

vi.mock('@/lib/categorization', () => ({
  categorizeExpense: async () => ({
    kpir_column: 'k13_other_expenses',
    category_label: 'Usługi',
    method: 'rule',
    confidence: 0.95,
  }),
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
          if (table === 'invoices') {
            return {
              data: {
                id: '11111111-1111-4111-8111-111111111111',
                tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                direction: 'incoming',
                ksef_number: '5260001246-20260925-000000000001-00',
                internal_number: 'FV 1/2026',
                issue_date: '2026-09-25',
                seller_data: { name: 'Dostawca', nip: '5260001246' },
                seller_nip: '5260001246',
                gross_total: 123,
                net_total: 100,
                vat_total: 23,
                fa3_data: {},
                invoice_line_items: [],
              },
              error: null,
            };
          }
          return { data: insertRow ? { id: 'exp-1' } : null, error: null };
        },
        maybeSingle: async () => {
          if (table === 'expenses') return { data: db.existing, error: db.existingError };
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
 * Sprawdzenie „czy wydatek z tej faktury już jest” to jedyna ochrona przed
 * drugim kosztem w KPiR — indeks na `expenses.ksef_invoice_id` nie jest
 * UNIQUE. Błąd tego zapytania nie może znaczyć „nie ma”.
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

beforeEach(() => {
  db.existing = null;
  db.existingError = null;
  db.inserts = [];
});

describe('auto-kategoryzacja: drugi wydatek z tej samej faktury', () => {
  it('błąd sprawdzenia NIE znaczy „nie ma” — job pada, nic się nie zapisuje', async () => {
    db.existingError = { message: 'statement timeout' };
    await expect(runAutoCategorizeInbox(DANE, ctx)).rejects.toThrow(/Nie można sprawdzić/);
    expect(db.inserts).toEqual([]);
  });

  it('wydatek już jest — pomijamy', async () => {
    db.existing = { id: 'exp-0' };
    await runAutoCategorizeInbox(DANE, ctx);
    expect(db.inserts).toEqual([]);
  });

  it('nie ma wydatku — powstaje jeden', async () => {
    await runAutoCategorizeInbox(DANE, ctx);
    expect(db.inserts).toHaveLength(1);
  });
});
