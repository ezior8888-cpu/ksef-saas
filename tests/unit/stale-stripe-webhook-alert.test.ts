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
vi.mock('@/lib/inngest/client', () => ({ inngest: { createFunction: vi.fn() } }));

import { checkStaleStripeWebhookEvents } from '@/lib/inngest/jobs/critical-alerts-monitor';

function queries(
  processingCount: number | null,
  failedCount: number | null,
  retryableCount = 0,
  processingError: Error | null = null,
) {
  const processing = {
    select: vi.fn(), eq: vi.fn(), lt: vi.fn(),
  };
  processing.select.mockReturnValue(processing);
  processing.eq.mockReturnValue(processing);
  processing.lt.mockResolvedValue({ count: processingCount, error: processingError });
  const failed = { select: vi.fn(), eq: vi.fn() };
  failed.select.mockReturnValue(failed);
  failed.eq.mockResolvedValue({ count: failedCount, error: null });
  const retryable = { select: vi.fn(), eq: vi.fn(), lt: vi.fn() };
  retryable.select.mockReturnValue(retryable);
  retryable.eq.mockReturnValue(retryable);
  retryable.lt.mockResolvedValue({ count: retryableCount, error: null });
  mocks.from.mockReturnValueOnce(processing).mockReturnValueOnce(failed)
    .mockReturnValueOnce(retryable);
  return { processing, failed, retryable };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T12:00:00.000Z'));
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.alertCritical.mockResolvedValue(undefined);
});

afterEach(() => { vi.useRealTimers(); });

describe('stale Stripe webhook alert', () => {
  it('counts old processing and failed receipts without including customer payloads', async () => {
    const { processing, failed, retryable } = queries(2, 1, 3);

    await expect(checkStaleStripeWebhookEvents()).resolves.toEqual({
      type: 'stale_stripe_webhooks', fired: true,
    });
    expect(mocks.from).toHaveBeenCalledTimes(3);
    expect(mocks.from).toHaveBeenCalledWith('stripe_webhook_events');
    expect(processing.eq).toHaveBeenCalledWith('processing_status', 'processing');
    expect(processing.lt).toHaveBeenCalledWith('received_at', '2026-09-24T11:45:00.000Z');
    expect(failed.eq).toHaveBeenCalledWith('processing_status', 'failed');
    expect(retryable.eq).toHaveBeenCalledWith('processing_status', 'retryable');
    expect(retryable.lt).toHaveBeenCalledWith('received_at', '2026-09-24T11:45:00.000Z');
    expect(mocks.alertCritical).toHaveBeenCalledOnce();
    expect(mocks.alertCritical.mock.calls[0]?.[2]).toMatchObject({
      fields: [
        { label: 'Processing > 15 min', value: '2' },
        { label: 'Failed', value: '1' },
        { label: 'Retryable > 15 min', value: '3' },
      ],
    });
    expect(JSON.stringify(mocks.alertCritical.mock.calls[0])).not.toContain('payload');
  });

  it('stays quiet on zero count or while the same alert is deduplicated', async () => {
    queries(0, 0);
    await expect(checkStaleStripeWebhookEvents()).resolves.toMatchObject({ fired: false });
    expect(mocks.alertCritical).not.toHaveBeenCalled();

    queries(1, 0);
    mocks.cacheGet.mockResolvedValue('already-sent');
    await expect(checkStaleStripeWebhookEvents()).resolves.toEqual({
      type: 'stale_stripe_webhooks', fired: false, reason: 'dedup',
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('does not turn an unavailable count into a healthy result', async () => {
    const failure = new Error('synthetic database error');
    queries(null, 0, 0, failure);
    await expect(checkStaleStripeWebhookEvents()).rejects.toBe(failure);
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });
});
