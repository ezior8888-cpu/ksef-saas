import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbResult = vi.hoisted(() => ({ error: null as null | { message: string } }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        limit: () => Promise.resolve({ error: dbResult.error }),
      }),
    }),
  }),
}));

// Stan kolejek pg-boss (AUD-34) ma osobne testy w straznik-kolejek.test.ts.
vi.mock('@/lib/jobs/jobs-health', async (orig) => ({
  ...(await orig<typeof import('@/lib/jobs/jobs-health')>()),
  readQueueHealth: async () => [],
}));

import { runOpsHeartbeat } from '@/lib/jobs/heartbeat';
import { getRegisteredJobs } from '@/lib/jobs/registry';
import { CRON_JOBS } from '@/lib/jobs/queues';
import '@/lib/jobs/handlers/ops-heartbeat';

const pingUrl = 'https://hc-ping.com/00000000-0000-0000-0000-synthetic000';

beforeEach(() => {
  dbResult.error = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('runOpsHeartbeat', () => {
  it('bez OPS_HEARTBEAT_URL nic nie wysyła', async () => {
    vi.stubEnv('OPS_HEARTBEAT_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(runOpsHeartbeat()).resolves.toEqual({ sent: false, reason: 'not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('odrzuca adres, który nie jest http(s)', async () => {
    vi.stubEnv('OPS_HEARTBEAT_URL', 'ftp://example.com/x');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(runOpsHeartbeat()).resolves.toEqual({ sent: false, reason: 'invalid-url' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gdy baza nie odpowiada, NIE pinguje — brak pinga to alarm u strażnika', async () => {
    vi.stubEnv('OPS_HEARTBEAT_URL', pingUrl);
    dbResult.error = { message: 'upstream' };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(runOpsHeartbeat()).resolves.toEqual({ sent: false, reason: 'db-unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gdy baza działa, pinguje dokładnie skonfigurowany adres', async () => {
    vi.stubEnv('OPS_HEARTBEAT_URL', pingUrl);
    const fetchMock = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runOpsHeartbeat()).resolves.toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(pingUrl);
  });

  it('odpowiedź inna niż 2xx albo błąd sieci = ping-failed', async () => {
    vi.stubEnv('OPS_HEARTBEAT_URL', pingUrl);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    await expect(runOpsHeartbeat()).resolves.toEqual({ sent: false, reason: 'ping-failed' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await expect(runOpsHeartbeat()).resolves.toEqual({ sent: false, reason: 'ping-failed' });
  });
});

describe('rejestracja crona', () => {
  it('cron.ops-heartbeat co minutę, bez ponowień', () => {
    const cron = CRON_JOBS.find((c) => c.queue === 'cron.ops-heartbeat');
    expect(cron?.cron).toBe('* * * * *');

    const job = getRegisteredJobs().find((j) => j.queue === 'cron.ops-heartbeat');
    expect(job?.maxRetries).toBe(0);
  });
});
