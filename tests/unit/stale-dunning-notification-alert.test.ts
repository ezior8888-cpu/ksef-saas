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

import { checkStaleDunningNotifications } from '@/lib/inngest/jobs/critical-alerts-monitor';

function queryResult(count: number | null, error: Error | null = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    lt: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.lt.mockResolvedValue({ count, error });
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

describe('stale dunning notification alert', () => {
  it('counts only old sending payment-failed claims and sends no customer details', async () => {
    const query = queryResult(2);

    await expect(checkStaleDunningNotifications()).resolves.toEqual({
      type: 'stale_dunning_notifications', fired: true,
    });

    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('billing_notifications');
    expect(query.select).toHaveBeenCalledExactlyOnceWith('id', { count: 'exact', head: true });
    expect(query.eq).toHaveBeenCalledWith('kind', 'payment_failed');
    expect(query.eq).toHaveBeenCalledWith('status', 'sending');
    expect(query.lt).toHaveBeenCalledExactlyOnceWith('sent_at', '2026-09-24T11:45:00.000Z');
    expect(mocks.cacheSet).toHaveBeenCalledExactlyOnceWith(
      'alerts:critical:lastsent:stale_dunning_notifications',
      '2026-09-24T12:00:00.000Z',
      30 * 60,
    );
    expect(mocks.alertCritical).toHaveBeenCalledOnce();
    expect(mocks.alertCritical.mock.calls[0]?.[2]).toMatchObject({
      fields: [
        { label: 'Próby > 15 min', value: '2' },
        { label: 'Próg', value: '15 min' },
      ],
    });
    const alert = JSON.stringify(mocks.alertCritical.mock.calls[0]);
    expect(alert).not.toContain('recipient_email');
    expect(alert).not.toContain('entity_id');
    expect(alert).not.toContain('resend_message_id');
  });

  it('stays quiet with zero stale claims or an active 30-minute dedup claim', async () => {
    queryResult(0);
    await expect(checkStaleDunningNotifications()).resolves.toEqual({
      type: 'stale_dunning_notifications', fired: false,
    });
    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(mocks.alertCritical).not.toHaveBeenCalled();

    queryResult(1);
    mocks.cacheGet.mockResolvedValue('already-sent');
    await expect(checkStaleDunningNotifications()).resolves.toEqual({
      type: 'stale_dunning_notifications', fired: false, reason: 'dedup',
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('fails closed when the count query errors', async () => {
    const failure = new Error('synthetic database error');
    queryResult(null, failure);

    await expect(checkStaleDunningNotifications()).rejects.toBe(failure);
    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('fails closed when the count is unavailable without a database error', async () => {
    queryResult(null);

    await expect(checkStaleDunningNotifications()).rejects.toThrow(
      'Stale dunning notification count unavailable',
    );
    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });
});
