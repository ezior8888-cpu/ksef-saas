import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  alertCritical: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('inngest', () => ({ cron: vi.fn((schedule: string) => schedule) }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/lib/alerts/slack', () => ({ alertCritical: mocks.alertCritical }));
vi.mock('@/lib/cache', () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/inngest/client', () => ({
  inngest: { createFunction: vi.fn() },
}));

import { checkOpenStripeFinancialCases } from '@/lib/inngest/jobs/critical-alerts-monitor';

type CountResult = { count: number | null; error: Error | null };

function mockCounts(values: Record<string, CountResult>) {
  const lt = vi.fn(async () => values.awaiting_admin);
  const eq = vi.fn((_column: string, state: string) => {
    if (state === 'awaiting_admin') return { lt };
    return Promise.resolve(values[state]);
  });
  const select = vi.fn(() => ({ eq }));
  mocks.from.mockImplementation(() => ({ select }));
  return { select, eq, lt };
}

function count(value: number | null, error: Error | null = null): CountResult {
  return { count: value, error };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T12:00:00.000Z'));
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.alertCritical.mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe('Stripe financial case alert', () => {
  it('alerts on quarantined, open and stale admin cases using counts only', async () => {
    const queries = mockCounts({
      quarantined: count(2),
      open: count(3),
      awaiting_admin: count(1),
    });

    await expect(checkOpenStripeFinancialCases()).resolves.toEqual({
      type: 'open_stripe_financial_cases', fired: true,
    });
    expect(mocks.from).toHaveBeenCalledTimes(3);
    expect(mocks.from).toHaveBeenCalledWith('stripe_financial_cases');
    expect(queries.select).toHaveBeenCalledWith(
      'stripe_object_id', { count: 'exact', head: true },
    );
    expect(queries.lt).toHaveBeenCalledWith('first_seen_at', '2026-09-25T11:45:00.000Z');
    expect(mocks.alertCritical).toHaveBeenCalledOnce();
    expect(mocks.alertCritical.mock.calls[0]?.[2]).toMatchObject({
      fields: [
        { label: 'Bez powiązania', value: '2' },
        { label: 'Powiązane, otwarte', value: '3' },
        { label: 'Admin > 15 min', value: '1' },
      ],
    });
    expect(JSON.stringify(mocks.alertCritical.mock.calls[0])).not.toContain('re_');
  });

  it('does not alert for settled or fresh admin cases', async () => {
    mockCounts({
      quarantined: count(0),
      open: count(0),
      awaiting_admin: count(0),
    });
    await expect(checkOpenStripeFinancialCases()).resolves.toMatchObject({ fired: false });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('does not treat a failed count as healthy', async () => {
    const failure = new Error('synthetic database failure');
    mockCounts({
      quarantined: count(0, failure),
      open: count(0),
      awaiting_admin: count(0),
    });
    await expect(checkOpenStripeFinancialCases()).rejects.toBe(failure);
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });
});
