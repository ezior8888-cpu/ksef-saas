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

type CountResult = { count: number | null; error: Error | null };

function mockOperationCounts(
  processing: CountResult,
  reconciliation: CountResult,
) {
  const lt = vi.fn(async () => processing);
  const eq = vi.fn((_column: string, status: string) => {
    if (status === 'processing') return { lt };
    if (status === 'reconciliation_required') return Promise.resolve(reconciliation);
    throw new Error('Unexpected refund status filter');
  });
  const select = vi.fn(() => ({ eq }));
  mocks.from.mockImplementation(() => ({ select }));
  return { eq, lt, select };
}

function count(value: number | null, error: Error | null = null): CountResult {
  return { count: value, error };
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
  it('counts stalled processing and all reconciliation_required operations without customer details', async () => {
    const query = mockOperationCounts(count(2), count(3));

    await expect(checkStaleRefundOperations()).resolves.toEqual({
      type: 'stale_refund_operations', fired: true,
    });
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledWith('stripe_refund_operations');
    expect(query.select).toHaveBeenCalledTimes(2);
    expect(query.select).toHaveBeenCalledWith('payment_id', { count: 'exact', head: true });
    expect(query.eq).toHaveBeenCalledWith('status', 'processing');
    expect(query.eq).toHaveBeenCalledWith('status', 'reconciliation_required');
    expect(query.lt).toHaveBeenCalledOnce();
    expect(query.lt).toHaveBeenCalledWith('created_at', '2026-09-24T11:45:00.000Z');
    expect(mocks.alertCritical).toHaveBeenCalledOnce();
    expect(mocks.alertCritical.mock.calls[0]?.[2]).toMatchObject({
      fields: [
        { label: 'Processing > 15 min', value: '2' },
        { label: 'Wymaga uzgodnienia', value: '3' },
      ],
    });
    expect(JSON.stringify(mocks.alertCritical.mock.calls[0])).not.toContain('payment_id');
  });

  it('alerts for reconciliation_required even when no processing operation is stale', async () => {
    mockOperationCounts(count(0), count(1));

    await expect(checkStaleRefundOperations()).resolves.toEqual({
      type: 'stale_refund_operations', fired: true,
    });
    expect(mocks.alertCritical).toHaveBeenCalledOnce();
  });

  it('stays quiet when both counts are zero and keeps the existing deduplication', async () => {
    mockOperationCounts(count(0), count(0));
    await expect(checkStaleRefundOperations()).resolves.toMatchObject({ fired: false });
    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(mocks.alertCritical).not.toHaveBeenCalled();

    mockOperationCounts(count(1), count(0));
    mocks.cacheGet.mockResolvedValue('already-sent');
    await expect(checkStaleRefundOperations()).resolves.toMatchObject({
      fired: false, reason: 'dedup',
    });
    expect(mocks.cacheGet).toHaveBeenCalledWith(
      'alerts:critical:lastsent:stale_refund_operations',
    );
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it.each(['processing', 'reconciliation_required'] as const)(
    'does not convert a %s count error into a healthy result',
    async (failingStatus) => {
      const failure = new Error('synthetic database error');
      mockOperationCounts(
        count(0, failingStatus === 'processing' ? failure : null),
        count(0, failingStatus === 'reconciliation_required' ? failure : null),
      );

      await expect(checkStaleRefundOperations()).rejects.toBe(failure);
      expect(mocks.cacheGet).not.toHaveBeenCalled();
      expect(mocks.alertCritical).not.toHaveBeenCalled();
    },
  );

  it.each(['processing', 'reconciliation_required'] as const)(
    'does not convert a null %s count into a healthy result',
    async (failingStatus) => {
      mockOperationCounts(
        count(failingStatus === 'processing' ? null : 0),
        count(failingStatus === 'reconciliation_required' ? null : 0),
      );

      await expect(checkStaleRefundOperations()).rejects.toThrow(
        'Refund operation counts unavailable',
      );
      expect(mocks.cacheGet).not.toHaveBeenCalled();
      expect(mocks.alertCritical).not.toHaveBeenCalled();
    },
  );
});
