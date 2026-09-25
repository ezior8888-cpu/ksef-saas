import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

const db = vi.hoisted(() => ({
  member: null as { user_id: string } | null,
  tables: [] as string[],
}));
const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/lib/email/send', () => ({ sendEmail: mocks.send }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      db.tables.push(table);
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        limit: () => q,
        maybeSingle: async () => {
          if (table === 'users') return { data: { last_active_tenant_id: 'dawna-firma' }, error: null };
          if (table === 'memberships') return { data: db.member, error: null };
          if (table === 'tenants') return { data: { subscription_tier: 'pro' }, error: null };
          return { data: { id: 'inv-1' }, error: null };
        },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ count: 7, error: null }).then(ok),
      });
      return q;
    },
  }),
}));

import { runEmailDay1, runEmailDay14, runEmailDay8 } from '@/lib/inngest/jobs/email-sequence';

/**
 * Odebranie członkostwa nie czyści `last_active_tenant_id`, a maile czytają
 * bazę kluczem serwisowym. Bez sprawdzenia członkostwa były członek dostawał
 * w mailu statystyki dawnej firmy. (Uwaga recenzji ChatGPT nr 1, 25.09.2026.)
 */

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};
const DANE = { email: 'byly@firma.test', firstName: 'Jan', userId: '33333333-3333-4333-8333-333333333333' };

beforeEach(() => {
  vi.clearAllMocks();
  db.member = null;
  db.tables = [];
});

describe('maile próbne a członkostwo w firmie', () => {
  it('dzień 8, członkostwo odebrane: nie czyta faktur ani wydatków dawnej firmy', async () => {
    await runEmailDay8(DANE, ctx);

    expect(db.tables).toContain('memberships');
    expect(db.tables).not.toContain('invoices');
    expect(db.tables).not.toContain('expenses');
    expect(mocks.send.mock.calls[0]?.[0].html).not.toContain('14');
  });

  it('dzień 8, członkostwo aktywne: statystyki liczone jak dotąd', async () => {
    db.member = { user_id: '33333333-3333-4333-8333-333333333333' };
    await runEmailDay8(DANE, ctx);

    expect(db.tables).toContain('invoices');
    expect(db.tables).toContain('expenses');
  });

  it('dzień 1 i 14 też patrzą tylko na firmę z aktywnym członkostwem', async () => {
    await runEmailDay1(DANE, ctx);
    await runEmailDay14(DANE, ctx);

    expect(db.tables).not.toContain('invoices');
    expect(db.tables).not.toContain('tenants');
  });
});
