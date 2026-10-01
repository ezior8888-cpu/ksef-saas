import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

/**
 * AUD-37 (krok 6 planu automatyzacji): tygodniowa weryfikacja brała 7 ostatnich
 * udanych kopii bez względu na wiek. Gdy nocny snapshot stał, raportowała
 * „✅ OK”, a nic innego nie zauważało, że nowej kopii nie ma.
 */

const HOUR = 3_600_000;

const state = vi.hoisted(() => ({
  newest: null as string | null,
  dbError: false,
  cache: new Map<string, string>(),
  cacheTtl: new Map<string, number>(),
  recent: [] as Array<Record<string, unknown>>,
}));

const mocks = vi.hoisted(() => ({
  alertCritical: vi.fn(),
  sendSlackAlert: vi.fn(),
  verifySnapshot: vi.fn(),
}));

vi.mock('@/lib/alerts/slack', () => ({
  alertCritical: mocks.alertCritical,
  sendSlackAlert: mocks.sendSlackAlert,
}));
vi.mock('@/lib/cache', () => ({
  cacheGet: async (key: string) => state.cache.get(key) ?? null,
  cacheSet: async (key: string, value: string, ttl: number) => {
    state.cache.set(key, value);
    state.cacheTtl.set(key, ttl);
  },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () =>
        state.dbError
          ? { data: null, error: { message: 'baza niedostępna' } }
          : { data: state.newest ? { started_at: state.newest } : null, error: null },
    };
    return { from: () => q };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => {
    const q = {
      select: () => q,
      eq: () => q,
      not: () => q,
      order: () => q,
      limit: async () => ({ data: state.recent, error: null }),
    };
    return { from: () => q };
  },
}));
vi.mock('@/lib/backup/verify', () => ({ verifySnapshot: mocks.verifySnapshot }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { backupAgeHours, isBackupStale, MAX_BACKUP_AGE_HOURS } from '@/lib/backup/freshness';
import { checkStaleBackup } from '@/lib/inngest/jobs/critical-alerts-monitor';
import { runVerifyBackup } from '@/lib/inngest/jobs/verify-backup';

const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: {
    run: async (_name, fn) => fn(),
    sleep: vi.fn(),
    sendEvent: vi.fn(),
    scheduleAfter: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.newest = null;
  state.dbError = false;
  state.cache.clear();
  state.cacheTtl.clear();
  state.recent = [];
  mocks.alertCritical.mockResolvedValue(undefined);
  mocks.verifySnapshot.mockResolvedValue({ ok: true, errors: [], warnings: [], rowCountDiff: [] });
});

describe('świeżość kopii', () => {
  const now = new Date('2026-10-02T06:00:00Z');

  it('kopia z dzisiejszej nocy jest świeża', () => {
    expect(isBackupStale('2026-10-02T00:00:41Z', now)).toBe(false);
    expect(backupAgeHours('2026-10-02T00:00:00Z', now)).toBe(6);
  });

  it('jedna opuszczona noc przekracza próg', () => {
    const lastNight = new Date(now.getTime() - (MAX_BACKUP_AGE_HOURS + 1) * HOUR).toISOString();
    expect(isBackupStale(lastNight, now)).toBe(true);
  });

  it('brak kopii albo nieczytelna data = nieaktualna', () => {
    expect(isBackupStale(null, now)).toBe(true);
    expect(isBackupStale('nie-data', now)).toBe(true);
  });
});

describe('monitor krytycznych alarmów — kopia bazy', () => {
  it('świeża kopia: bez alarmu', async () => {
    state.newest = ago(5);
    await expect(checkStaleBackup()).resolves.toEqual({ type: 'stale_backup', fired: false });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('kopia sprzed 2 dni: alarm, potem przypomnienie dopiero po 6 h', async () => {
    state.newest = ago(49);
    await expect(checkStaleBackup()).resolves.toMatchObject({ fired: true });
    expect(mocks.alertCritical).toHaveBeenCalledWith(
      'Kopia bazy jest nieaktualna',
      expect.any(String),
      expect.objectContaining({
        fields: expect.arrayContaining([{ label: 'Najnowsza udana kopia', value: '49 h temu' }]),
      }),
    );
    expect([...state.cacheTtl.values()]).toEqual([6 * 60 * 60]);

    await expect(checkStaleBackup()).resolves.toMatchObject({ fired: false, reason: 'dedup' });
    expect(mocks.alertCritical).toHaveBeenCalledTimes(1);
  });

  it('żadnej udanej kopii: alarm z „brak”', async () => {
    await checkStaleBackup();
    expect(mocks.alertCritical.mock.calls[0]?.[2].fields[0]).toEqual({
      label: 'Najnowsza udana kopia',
      value: 'brak',
    });
  });

  it('niedostarczony alarm nie zapisuje deduplikacji (ponowi się za 5 min)', async () => {
    state.newest = ago(30);
    mocks.alertCritical.mockRejectedValueOnce(new Error('brak kanału'));
    await expect(checkStaleBackup()).rejects.toThrow('brak kanału');
    expect(state.cache.size).toBe(0);
  });

  it('błąd bazy nie udaje świeżej kopii', async () => {
    state.dbError = true;
    await expect(checkStaleBackup()).rejects.toBeTruthy();
  });
});

describe('tygodniowa weryfikacja', () => {
  const row = (id: string, hours: number) => ({
    id: `${id}0000000-0000-4000-8000-000000000000`,
    kind: 'daily',
    r2_key: `db/${id}.json.gz`,
    checksum: 'x',
    row_counts: {},
    started_at: ago(hours),
  });

  it('wszystkie stare kopie poprawne, ale nowej brak: alarm zamiast „OK”', async () => {
    state.recent = [row('a', 24 * 9), row('b', 24 * 10)];
    await expect(runVerifyBackup(ctx)).resolves.toMatchObject({ verified: 2, failed: 0, stale: true });
    const texts = mocks.sendSlackAlert.mock.calls.map(([m]) => m as { channel: string; text: string });
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ channel: 'urgent' });
    expect(texts[0]?.text).toContain('216 h');
  });

  it('świeża kopia i poprawne sumy: zwykły raport do #metrics', async () => {
    state.recent = [row('a', 1), row('b', 25)];
    await expect(runVerifyBackup(ctx)).resolves.toMatchObject({ verified: 2, failed: 0, stale: false });
    expect(mocks.sendSlackAlert).toHaveBeenCalledTimes(1);
    expect(mocks.sendSlackAlert.mock.calls[0]?.[0]).toMatchObject({ channel: 'metrics' });
  });
});
