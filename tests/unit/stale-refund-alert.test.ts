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

import { checkStaleRefundOperations } from '@/lib/inngest/jobs/critical-alerts-monitor';

function queryResult(count: number | null, error: Error | null = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    lt: vi.fn(async () => ({ count, error })),
  };
  mocks.from.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T12:00:00.000Z'));
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.alertCritical.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('stale Stripe refund operations alert', () => {
  it('counts only processing operations older than 15 minutes, without exposing payment details', async () => {
    const query = queryResult(2);

    await expect(checkStaleRefundOperations()).resolves.toEqual({
      type: 'stale_refund_operations', fired: true,
    });
    expect(mocks.from).toHaveBeenCalledWith('stripe_refund_operations');
    expect(query.eq).toHaveBeenCalledWith('status', 'processing');
    expect(query.lt).toHaveBeenCalledWith('created_at', '2026-09-24T11:45:00.000Z');
    expect(mocks.alertCritical).toHaveBeenCalledOnce();
    expect(mocks.alertCritical.mock.calls[0]?.[2]).toMatchObject({
      fields: [
        { label: 'Operacje > 15 min', value: '2' },
        { label: 'Próg', value: '15 min' },
      ],
    });
    expect(JSON.stringify(mocks.alertCritical.mock.calls[0])).not.toContain('payment_id');
  });

  it('does not alert when no operation is stale or a previous alert is still deduplicated', async () => {
    queryResult(0);
    await expect(checkStaleRefundOperations()).resolves.toMatchObject({ fired: false });
    expect(mocks.alertCritical).not.toHaveBeenCalled();

    queryResult(1);
    mocks.cacheGet.mockResolvedValue('already-sent');
    await expect(checkStaleRefundOperations()).resolves.toMatchObject({
      fired: false, reason: 'dedup',
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('does not convert a failed count into a healthy result', async () => {
    const failure = new Error('synthetic database error');
    queryResult(null, failure);
    await expect(checkStaleRefundOperations()).rejects.toBe(failure);
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });
});
