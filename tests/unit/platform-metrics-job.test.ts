import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '@/lib/jobs/registry';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), admin: vi.fn(), from: vi.fn(), health: vi.fn(), listUsers: vi.fn(),
  slack: vi.fn(), captureException: vi.fn(), createFunction: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.session }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/ksef/health-status', () => ({ getKsefHealthSnapshot: mocks.health }));
vi.mock('@/lib/alerts/slack', () => ({ sendSlackAlert: mocks.slack }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { createFunction: mocks.createFunction } }));

import { collectPlatformOverviewMetrics } from '@/lib/analytics/platform-metrics';
import { runDailyAnalyticsDigest } from '@/lib/inngest/jobs/daily-analytics-digest';

const snapshot = {
  level: 'operational', lastCheckedAt: '2026-09-13T10:00:00.000Z', responseTimeMs: 50,
  consecutiveFailures: 0, isMfOutage: false, error: null, env: 'test',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_EMAILS', '');
  vi.stubEnv('KSEF_ENV', 'test');
  mocks.session.mockImplementation(() => { throw new Error('Jobs must not require a request session'); });
  mocks.listUsers.mockResolvedValue({ data: { users: [], total: 17 }, error: null });
  const result = { data: [], count: 5, error: null };
  const query = {
    select: () => query, eq: () => query, is: () => query, not: () => query, gte: () => query,
    then: <T>(resolve: (value: typeof result) => T | PromiseLike<T>) => Promise.resolve(result).then(resolve),
  };
  mocks.from.mockReturnValue(query);
  mocks.admin.mockReturnValue({ from: mocks.from, auth: { admin: { listUsers: mocks.listUsers } } });
  mocks.health.mockResolvedValue(snapshot);
  mocks.slack.mockResolvedValue(undefined);
});

afterEach(() => { vi.unstubAllEnvs(); });

function jobContext(): JobContext {
  return {
    step: {
      run: async <T>(_name: string, operation: () => T | Promise<T>): Promise<T> => operation(),
      sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn(),
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    attempt: 0,
  };
}

describe('platform metrics from a trusted background job', () => {
  it('collects metrics without a session or an administrator allowlist', async () => {
    const result = await collectPlatformOverviewMetrics();

    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.health).toHaveBeenCalledWith('test');
    expect(result).toEqual({
      totalUsers: 17, totalTenants: 5, activeTenants: 5, deletedTenants: 5, signups24h: 5,
      newTenants7d: 5, invoicesIssued24h: 5, invoicesAccepted24h: 5, offlineQueued: 5,
      pendingJoinRequests: 5, ksefHealth: snapshot,
    });
  });

  it('runs the existing digest body without cookies and sends its aggregate result', async () => {
    const result = await runDailyAnalyticsDigest(jobContext());

    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(result).toEqual({ signups_24h: 5, invoices_accepted_24h: 5 });
    expect(mocks.slack).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'metrics',
      context: expect.objectContaining({ signups_24h: 5, invoices_accepted_24h: 5, active_tenants: 5 }),
    }));
  });

  it('does not send a digest if metric collection throws', async () => {
    const failure = new Error('Synthetic unavailable database');
    mocks.admin.mockImplementation(() => { throw failure; });

    await expect(runDailyAnalyticsDigest(jobContext())).rejects.toBe(failure);

    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.slack).not.toHaveBeenCalled();
  });
});
