import { beforeEach, describe, expect, it, vi } from 'vitest';

// AUD-18: niekompletne pobranie skrzynki było tylko linijką w logu.
// Monitor (co 5 min) alarmuje, gdy firma z poświadczeniami KSeF ma HWM
// skrzynki starszy niż próg — łapie padające przebiegi, zatrzymany cron
// i zaległość po stronie MF. W alarmie liczby, bez NIP-ów.

const mocks = vi.hoisted(() => ({
  alertCritical: vi.fn(), cacheGet: vi.fn(), cacheSet: vi.fn(), captureException: vi.fn(),
  tenants: [] as { id: string; ksef_verified_at: string | null }[],
  cursors: [] as { tenant_id: string; window_to: string | null }[],
  error: null as Error | null,
}));

vi.mock('inngest', () => ({ cron: vi.fn((schedule: string) => schedule) }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/lib/alerts/slack', () => ({ alertCritical: mocks.alertCritical }));
vi.mock('@/lib/cache', () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { createFunction: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const data = table === 'tenants' ? mocks.tenants : mocks.cursors;
      const q = {
        select: () => q, not: () => q, in: () => q, eq: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: mocks.error ? null : data, error: mocks.error }).then(ok),
      };
      return q;
    },
  }),
}));

import { checkStaleInboxSync } from '@/lib/inngest/jobs/critical-alerts-monitor';

const NOW = new Date('2026-10-02T12:00:00Z');
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.cacheGet.mockResolvedValue(null);
  mocks.alertCritical.mockResolvedValue(undefined);
  mocks.error = null;
  mocks.tenants = [{ id: T1, ksef_verified_at: '2026-09-01T00:00:00Z' }];
  mocks.cursors = [{ tenant_id: T1, window_to: '2026-10-02T11:50:00Z' }];
});

describe('alarm zaległości skrzynki KSeF', () => {
  it('świeży HWM — bez alarmu', async () => {
    expect(await checkStaleInboxSync()).toEqual({ type: 'stale_inbox_sync', fired: false });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('HWM starszy niż 6 h — alarm z liczbą firm', async () => {
    mocks.cursors = [{ tenant_id: T1, window_to: '2026-10-02T05:00:00Z' }];
    expect(await checkStaleInboxSync()).toEqual({ type: 'stale_inbox_sync', fired: true });
    const [title, , opts] = mocks.alertCritical.mock.calls[0]!;
    expect(title).toContain('Skrzynka KSeF');
    expect(JSON.stringify(opts)).toContain('1');
    expect(JSON.stringify(mocks.alertCritical.mock.calls)).not.toContain('1234567890');
  });

  it('firma z poświadczeniami bez żadnego przebiegu od ponad 6 h — alarm', async () => {
    mocks.tenants = [
      { id: T1, ksef_verified_at: '2026-09-01T00:00:00Z' },
      { id: T2, ksef_verified_at: '2026-10-01T00:00:00Z' },
    ];
    expect((await checkStaleInboxSync()).fired).toBe(true);
  });

  it('świeżo podpięta firma (przed pierwszym przebiegiem) — jeszcze bez alarmu', async () => {
    mocks.tenants = [
      { id: T1, ksef_verified_at: '2026-09-01T00:00:00Z' },
      { id: T2, ksef_verified_at: '2026-10-02T11:00:00Z' },
    ];
    expect((await checkStaleInboxSync()).fired).toBe(false);
  });

  it('błąd odczytu — rzuca (monitor zamienia to w check-error + Sentry)', async () => {
    mocks.error = new Error('fixture offline');
    await expect(checkStaleInboxSync()).rejects.toThrow('fixture offline');
  });
});
