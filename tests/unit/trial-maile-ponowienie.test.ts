import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  send: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendTrialEndingEmail: mocks.send }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'wlasciciel@example.test' } } }) } },
    from(table: string) {
      const predicates: Array<(r: Row) => boolean> = [];
      let op: 'select' | 'insert' | 'update' = 'select';
      let patch: Row = {};
      let single = false;
      const rows = () => (mocks.tables[table] ??= []);
      const run = () => {
        if (op === 'insert') {
          const dup = rows().some((r) => r.entity_id === patch.entity_id && r.kind === patch.kind);
          if (dup) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          rows().push({ ...patch });
          return { data: null, error: null };
        }
        const hit = rows().filter((r) => predicates.every((p) => p(r)));
        if (op === 'update') hit.forEach((r) => Object.assign(r, patch));
        const data = hit.map((r) => ({ ...r }));
        return { data: single ? data[0] ?? null : data, error: null };
      };
      const q = {
        select: () => q,
        insert(r: Row) { op = 'insert'; patch = r; return q; },
        update(r: Row) { op = 'update'; patch = r; return q; },
        eq(k: string, v: unknown) { predicates.push((r) => r[k] === v); return q; },
        in(k: string, v: unknown[]) { predicates.push((r) => v.includes(r[k])); return q; },
        not: () => q,
        lte: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle() { single = true; return Promise.resolve(run()); },
        then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) { return Promise.resolve(run()).then(ok, ko); },
      };
      return q;
    },
  }),
}));

import { runTrialCountdownEmails } from '@/lib/inngest/jobs/trial-countdown-emails';

/**
 * AUD-87: zadanie zapisywało „sending” PRZED wysyłką i nigdy tego nie
 * zdejmowało. Błąd Resend = wpis zostaje, kolejne przebiegi widzą duplikat
 * (UNIQUE entity_id+kind) i mail o końcu triala nie wychodzi nigdy.
 */

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};

const notif = () => mocks.tables.billing_notifications ?? [];

beforeEach(() => {
  mocks.send.mockReset();
  mocks.tables = {
    subscriptions: [
      { id: 'sub-1', tenant_id: 'ten-1', plan: 'monthly', status: 'trialing', trial_end: new Date(Date.now() + 6.5 * 864e5).toISOString() },
    ],
    memberships: [{ user_id: 'u-1', organization_id: 'ten-1', role: 'owner', status: 'active' }],
    tenants: [{ id: 'ten-1', name: 'Firma' }],
    billing_notifications: [],
  };
});

describe('mail o końcu triala — błąd wysyłki nie blokuje go na zawsze (AUD-87)', () => {
  it('błąd Resend: wpis „failed” (nie „sending”) i zadanie do ponowienia', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Resend error: 503'));

    await expect(runTrialCountdownEmails(ctx)).rejects.toThrow(/ponowienia/);

    expect(notif()).toEqual([expect.objectContaining({ kind: 'trial_7d', status: 'failed' })]);
  });

  it('ponowienie po błędzie wysyła mail i oznacza „sent”, z tym samym kluczem idempotencji', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Resend error: 503'));
    await runTrialCountdownEmails(ctx).catch(() => undefined);

    mocks.send.mockResolvedValueOnce({ sent: true, messageId: 'msg-1' });
    await expect(runTrialCountdownEmails({ ...ctx, attempt: 1 })).resolves.toMatchObject({ sent: 1 });

    expect(notif()).toEqual([expect.objectContaining({ status: 'sent', resend_message_id: 'msg-1' })]);
    const keys = mocks.send.mock.calls.map((c) => (c[2] as { idempotencyKey?: string } | undefined)?.idempotencyKey);
    expect(keys).toEqual(['trial/sub-1/trial_7d', 'trial/sub-1/trial_7d']);
  });

  it('już wysłany — bez drugiego maila', async () => {
    mocks.tables.billing_notifications = [{ entity_id: 'sub-1', kind: 'trial_7d', status: 'sent' }];

    await expect(runTrialCountdownEmails(ctx)).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('trial anulowany (cancel_at_period_end) — bez maila „karta zostanie obciążona” (AUD-75)', async () => {
    mocks.tables.subscriptions![0]!.cancel_at_period_end = true;

    await expect(runTrialCountdownEmails(ctx)).resolves.toMatchObject({ sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
