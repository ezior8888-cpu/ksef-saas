import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  alertCritical: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/lib/alerts/slack', () => ({ alertCritical: mocks.alertCritical }));
vi.mock('@/lib/cache', () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/jobs/events', () => ({
  inngest: { createFunction: vi.fn() },
}));

import { checkStaleStripeCustomerAttempts } from '@/lib/jobs/runners/critical-alerts-monitor';

const inputEmail = 'owner@example.test';

type CountResult = { count: number | null; error: Error | null };

function count(value: number | null, error: Error | null = null): CountResult {
  return { count: value, error };
}

function mockCounts(values: Record<string, CountResult>) {
  const creatingLt = vi.fn(async () => values.creating);
  const eq = vi.fn((_column: string, state: string) => {
    if (state === 'creating') return { lt: creatingLt };
    return Promise.resolve(values[state]);
  });
  const select = vi.fn(() => ({ eq }));
  mocks.from.mockImplementation(() => ({ select }));
  return { select, eq, creatingLt };
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

describe('stale Stripe Customer attempts alert', () => {
  it('alerts with counts only for old creating and every uncertain claim', async () => {
    const queries = mockCounts({ creating: count(2), uncertain: count(3) });
    await expect(checkStaleStripeCustomerAttempts()).resolves.toEqual({
      type: 'stale_stripe_customer_attempts', fired: true,
    });
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledWith('stripe_customer_attempts');
    expect(queries.select).toHaveBeenCalledWith(
      'id', { count: 'exact', head: true },
    );
    expect(queries.creatingLt).toHaveBeenCalledWith(
      'created_at', '2026-09-25T11:45:00.000Z',
    );
    expect(mocks.alertCritical.mock.calls[0]?.[2]).toMatchObject({
      fields: [
        { label: 'Creating > 15 min', value: '2' },
        { label: 'Niepewne', value: '3' },
      ],
    });
    const alert = JSON.stringify(mocks.alertCritical.mock.calls[0]);
    expect(alert).not.toContain('cus_');
    expect(alert).not.toContain(inputEmail);
  });

  it('stays quiet when clear or deduplicated', async () => {
    mockCounts({ creating: count(0), uncertain: count(0) });
    await expect(checkStaleStripeCustomerAttempts()).resolves.toMatchObject({
      fired: false,
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();

    mockCounts({ creating: count(0), uncertain: count(1) });
    mocks.cacheGet.mockResolvedValue('already-sent');
    await expect(checkStaleStripeCustomerAttempts()).resolves.toEqual({
      type: 'stale_stripe_customer_attempts', fired: false, reason: 'dedup',
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('retries after failed alert delivery without setting dedup', async () => {
    mockCounts({ creating: count(0), uncertain: count(1) });
    mocks.alertCritical.mockRejectedValueOnce(new Error('delivery not confirmed'));
    await expect(checkStaleStripeCustomerAttempts())
      .rejects.toThrow('delivery not confirmed');
    expect(mocks.cacheSet).not.toHaveBeenCalled();
    await expect(checkStaleStripeCustomerAttempts()).resolves.toEqual({
      type: 'stale_stripe_customer_attempts', fired: true,
    });
    expect(mocks.alertCritical).toHaveBeenCalledTimes(2);
    expect(mocks.cacheSet).toHaveBeenCalledOnce();
  });

  it('does not report healthy when a count fails', async () => {
    const failure = new Error('synthetic database failure');
    mockCounts({ creating: count(0), uncertain: count(null, failure) });
    await expect(checkStaleStripeCustomerAttempts()).rejects.toBe(failure);
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });
});
