import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  alertCritical: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));
vi.mock('inngest', () => ({ cron: vi.fn((schedule: string) => schedule) }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/alerts/slack', () => ({ alertCritical: mocks.alertCritical }));
vi.mock('@/lib/cache', () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { createFunction: vi.fn() } }));

import { checkBlockedKsefOfflineQueue } from '@/lib/inngest/jobs/critical-alerts-monitor';

function query(result: { count?: number | null; data?: { deadline: string } | null; error: Error | null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('KSEF_ENV', 'production');
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.alertCritical.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('blocked Offline24 environment alert', () => {
  it('alerts on one legacy row with count and nearest deadline, excluding invoice data', async () => {
    const count = query({ count: 1, error: null });
    const nearest = query({ data: { deadline: '2026-09-26T10:00:00Z' }, error: null });
    mocks.from.mockReturnValueOnce(count).mockReturnValueOnce(nearest);
    await expect(checkBlockedKsefOfflineQueue()).resolves.toEqual({
      type: 'offline_environment_blocked', fired: true,
    });
    expect(count.eq).toHaveBeenCalledWith('status', 'queued');
    expect(count.or).toHaveBeenCalledWith('ksef_environment.is.null,ksef_environment.neq.production');
    expect(mocks.cacheSet).toHaveBeenCalledWith(
      'alerts:critical:lastsent:offline_environment_blocked:production',
      expect.any(String), 1800,
    );
    const alert = JSON.stringify(mocks.alertCritical.mock.calls[0]);
    expect(alert).toContain('2026-09-26T10:00:00Z');
    expect(alert).not.toContain('invoice_id');
  });

  it('stays quiet at zero and fails closed on an unknown count', async () => {
    mocks.from.mockReturnValueOnce(query({ count: 0, error: null }))
      .mockReturnValueOnce(query({ data: null, error: null }));
    await expect(checkBlockedKsefOfflineQueue()).resolves.toEqual({
      type: 'offline_environment_blocked', fired: false,
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();

    mocks.from.mockReturnValueOnce(query({ count: null, error: null }))
      .mockReturnValueOnce(query({ data: null, error: null }));
    await expect(checkBlockedKsefOfflineQueue()).rejects.toThrow('count unavailable');
  });
});
