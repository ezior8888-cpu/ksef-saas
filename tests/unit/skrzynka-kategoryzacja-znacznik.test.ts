import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

/**
 * K2 z rewizji 03.10.2026: wiersz skrzynki dostaje przy zapisie
 * `fa3_data._pendingFullFetch = true`, ale nikt go nie czyścił. Po naprawie
 * `auto-categorize` po udanym przebiegu (XML zarchiwizowany albo niepotrzebny
 * ORAZ koszt utworzony albo już istniał) ustawia `_pendingFullFetch = false`,
 * dzięki czemu cron uzupełniający wie, których faktur jeszcze nie domknięto.
 * Błąd pobrania XML zostawia znacznik — cron spróbuje ponownie.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  archive: vi.fn(),
  updates: [] as Array<{ table: string; patch: Row; filters: Array<[string, unknown]> }>,
  fa3: { _source: 'inbox-metadata', _pendingFullFetch: true, ksefNumber: 'X' } as Row,
}));

vi.mock('@/lib/ksef/inbox-xml', () => ({ archiveInboxInvoiceXml: db.archive }));
vi.mock('@/lib/categorization', () => ({
  categorizeExpense: async () => ({
    kpir_column: 'col_13',
    category_label: 'Usługi',
    method: 'rule',
    confidence: 0.95,
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let patch: Row | null = null;
      let inserted = false;
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (column: string, value: unknown) => { filters.push([column, value]); return q; },
        limit: () => q,
        insert: () => { inserted = true; return q; },
        update: (p: Row) => { patch = p; db.updates.push({ table, patch: p, filters }); return q; },
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
                currency: 'PLN',
                fa3_data: db.fa3,
                invoice_line_items: [],
              },
              error: null,
            };
          }
          return { data: inserted ? { id: 'exp-1' } : null, error: null };
        },
        maybeSingle: async () => {
          if (table === 'invoices') {
            if (patch) return { data: { id: '11111111-1111-4111-8111-111111111111' }, error: null };
            return {
              data: {
                id: '11111111-1111-4111-8111-111111111111',
                tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                direction: 'incoming',
                origin: 'ksef_inbox',
                ksef_status: 'accepted',
                ksef_environment: 'test',
                fa3_data: db.fa3,
              },
              error: null,
            };
          }
          if (table === 'expenses') return { data: null, error: null };
          if (table === 'memberships') return { data: { user_id: 'u-1' }, error: null };
          return { data: null, error: null };
        },
      });
      return q;
    },
  }),
}));

import { runAutoCategorizeInbox } from '@/lib/jobs/runners/auto-categorize-inbox';

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};
const DANE = {
  invoiceId: '11111111-1111-4111-8111-111111111111',
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  environment: 'test' as const,
};

function invoiceUpdates() {
  return db.updates.filter((u) => u.table === 'invoices');
}

beforeEach(() => {
  vi.stubEnv('KSEF_ENV', 'test');
  db.updates = [];
  db.archive.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('auto-kategoryzacja: znacznik _pendingFullFetch (K2)', () => {
  it.each([
    { archived: true },
    { archived: false, reason: 'has-xml' },
  ])('po udanym przebiegu (%j) ustawia _pendingFullFetch=false, zachowując resztę fa3_data', async (result) => {
    db.archive.mockResolvedValue(result);

    await expect(runAutoCategorizeInbox(DANE, ctx)).resolves.toEqual({ success: true });

    const marks = invoiceUpdates();
    expect(marks).toHaveLength(1);
    const fa3 = marks[0]!.patch.fa3_data as Row;
    expect(fa3._pendingFullFetch).toBe(false);
    expect(typeof fa3._processedAt).toBe('string');
    expect(fa3.ksefNumber).toBe('X');
    expect(fa3._source).toBe('inbox-metadata');
    expect(marks[0]!.filters).toEqual(expect.arrayContaining([
      ['id', DANE.invoiceId],
      ['tenant_id', DANE.tenantId],
    ]));
  });

  it('błąd pobrania XML zostawia znacznik (cron uzupełniający spróbuje ponownie), ale koszt powstaje', async () => {
    db.archive.mockResolvedValue({ archived: false, reason: 'error' });

    await expect(runAutoCategorizeInbox(DANE, ctx)).resolves.toEqual({ success: true });

    expect(invoiceUpdates()).toHaveLength(0);
  });
});
