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

import { checkStaleStripeCheckoutAttempts } from '@/lib/inngest/jobs/critical-alerts-monitor';

type CountResult = { count: number | null; error: Error | null };

function count(value: number | null, error: Error | null = null): CountResult {
  return { count: value, error };
}

function mockCounts(values: Record<string, CountResult>) {
  const creatingLt = vi.fn(async () => values.creating);
  const openLt = vi.fn(async () => values.open);
  const eq = vi.fn((_column: string, state: string) => {
    if (state === 'creating') return { lt: creatingLt };
    if (state === 'open') return { lt: openLt };
    return Promise.resolve(values[state]);
  });
  const select = vi.fn(() => ({ eq }));
  mocks.from.mockImplementation(() => ({ select }));
  return { select, eq, creatingLt, openLt };
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

describe('stale Stripe Checkout attempts alert', () => {
  it('alerts by count for creating older than 15 minutes and every uncertain/held claim', async () => {
    const queries = mockCounts({
      creating: count(2),
      uncertain: count(1),
      held: count(3),
      open: count(4),
    });

    await expect(checkStaleStripeCheckoutAttempts()).resolves.toEqual({
      type: 'stale_stripe_checkout_attempts', fired: true,
    });
    expect(mocks.from).toHaveBeenCalledTimes(4);
    expect(mocks.from).toHaveBeenCalledWith('stripe_checkout_attempts');
    expect(queries.select).toHaveBeenCalledWith(
      'id', { count: 'exact', head: true },
    );
    expect(queries.eq).toHaveBeenCalledWith('status', 'creating');
    expect(queries.eq).toHaveBeenCalledWith('status', 'uncertain');
    expect(queries.eq).toHaveBeenCalledWith('status', 'held');
    expect(queries.eq).toHaveBeenCalledWith('status', 'open');
    expect(queries.creatingLt).toHaveBeenCalledWith(
      'created_at', '2026-09-25T11:45:00.000Z',
    );
    expect(queries.openLt).toHaveBeenCalledWith(
      'session_expires_at', '2026-09-25T11:45:00.000Z',
    );
    expect(mocks.alertCritical).toHaveBeenCalledOnce();
    expect(mocks.alertCritical.mock.calls[0]?.[2]).toMatchObject({
      fields: [
        { label: 'Creating > 15 min', value: '2' },
        { label: 'Niepewne', value: '1' },
        { label: 'Wstrzymane', value: '3' },
        { label: 'Open po terminie > 15 min', value: '4' },
      ],
    });
    expect(JSON.stringify(mocks.alertCritical.mock.calls[0])).not.toContain('cs_');
    expect(JSON.stringify(mocks.alertCritical.mock.calls[0])).not.toContain('cus_');
  });

  it('stays quiet for zero counts or duplicate alert', async () => {
    mockCounts({
      creating: count(0), uncertain: count(0), held: count(0), open: count(0),
    });
    await expect(checkStaleStripeCheckoutAttempts()).resolves.toMatchObject({
      fired: false,
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();

    mockCounts({
      creating: count(1), uncertain: count(0), held: count(0), open: count(0),
    });
    mocks.cacheGet.mockResolvedValue('already-sent');
    await expect(checkStaleStripeCheckoutAttempts()).resolves.toEqual({
      type: 'stale_stripe_checkout_attempts', fired: false, reason: 'dedup',
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('does not cache a failed delivery and retries on the next check', async () => {
    mockCounts({
      creating: count(0), uncertain: count(1), held: count(0), open: count(0),
    });
    mocks.alertCritical.mockRejectedValueOnce(new Error('delivery not confirmed'));

    await expect(checkStaleStripeCheckoutAttempts())
      .rejects.toThrow('delivery not confirmed');
    expect(mocks.cacheSet).not.toHaveBeenCalled();

    await expect(checkStaleStripeCheckoutAttempts()).resolves.toEqual({
      type: 'stale_stripe_checkout_attempts', fired: true,
    });
    expect(mocks.alertCritical).toHaveBeenCalledTimes(2);
    expect(mocks.cacheSet).toHaveBeenCalledOnce();
    expect(mocks.alertCritical.mock.invocationCallOrder[1])
      .toBeLessThan(mocks.cacheSet.mock.invocationCallOrder[0]);
  });
  it('does not treat a failed or unavailable count as healthy', async () => {
    const failure = new Error('synthetic database failure');
    mockCounts({
      creating: count(0),
      uncertain: count(null, failure),
      held: count(0),
      open: count(0),
    });
    await expect(checkStaleStripeCheckoutAttempts()).rejects.toBe(failure);
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });
});
