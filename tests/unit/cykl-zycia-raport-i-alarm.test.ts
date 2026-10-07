import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

/**
 * Cykl życia faktury, PR 4b: raport dzienny (`cron.ksef-lifecycle-report`)
 * i alarm strażnika w monitorze alarmów (`checkKsefLifecycleViolations`, W3).
 */

const m = vi.hoisted(() => ({
  // D-A4-1b-3 PR B: wiersze strażnika niosą `detail` (I5D — środowisko sprawdzenia oryginału).
  violations: [] as Array<{ invariant: string; detail?: unknown }>,
  counts: {} as Record<string, number>,
  audit: [] as Array<{ action: string; user_id: string | null }>,
  slack: vi.fn(),
  alertCritical: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string) => (fn === 'ksef_lifecycle_violations' ? { data: m.violations, error: null } : { data: null, error: { message: fn } }),
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      // `in('action', …)` filtruje ślad jak PostgREST — raport liczy tylko akcje ze swojej listy.
      let actions: unknown[] | null = null;
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        in: (k: string, vs: unknown[]) => { if (k === 'action') actions = vs; return q; },
        gte: () => q,
        limit: () => q,
        then: (ok: (v: unknown) => unknown) => {
          if (table === 'audit_logs') {
            const allowed = actions;
            return ok({ data: allowed ? m.audit.filter((r) => allowed.includes(r.action)) : m.audit, error: null });
          }
          const status = filters.find(([k]) => k === 'ksef_status')?.[1] as string | undefined;
          return ok({ data: null, error: null, count: m.counts[status ?? ''] ?? 0 });
        },
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/alerts/slack', () => ({ sendSlackAlert: m.slack, alertCritical: m.alertCritical }));
vi.mock('@/lib/cache', () => ({ cacheGet: m.cacheGet, cacheSet: m.cacheSet }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { formatLifecycleReport, runKsefLifecycleReport } from '@/lib/jobs/runners/ksef-lifecycle-report';
import { checkKsefLifecycleViolations } from '@/lib/jobs/runners/critical-alerts-monitor';

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.violations = [];
  m.counts = {};
  m.audit = [];
  m.cacheGet.mockResolvedValue(null);
  m.cacheSet.mockResolvedValue(true);
});

describe('raport dzienny', () => {
  it('formatLifecycleReport: stany, przyjęte, naruszenia, akcje, ponowienia automatu', () => {
    const text = formatLifecycleReport({
      statuses: { draft: 3, failed: 2, queued: 0, sending: 0, offline_queued: 0, rejected: 1 },
      accepted24h: 17,
      violations: { I4: 1, I1: 2 },
      actions24h: { 'invoice.send_requeued': 5, 'invoice.operator_reset': 1, 'invoice.send_reset': 0 },
      autoRequeues24h: 4,
    });
    expect(text).toContain('draft 3 · queued 0 · sending 0 · offline_queued 0 · failed 2 · rejected 1');
    expect(text).toContain('Przyjęte w 24 h: 17');
    expect(text).toContain('Naruszenia strażnika: I1 2 · I4 1');
    expect(text).toContain('Akcje w 24 h: operator_reset 1 · send_requeued 5');
    expect(text).toContain('Ponowienia automatu w 24 h: 4');
  });

  it('runner zbiera liczby i wysyła na kanał metrics; brak naruszeń = „brak”', async () => {
    m.counts = { failed: 2, accepted: 9 };
    m.audit = [
      { action: 'invoice.send_requeued', user_id: null },
      { action: 'invoice.send_requeued', user_id: 'user' },
      { action: 'invoice.operator_reset', user_id: 'op' },
    ];

    const result = await runKsefLifecycleReport(ctx);

    expect(result).toMatchObject({ accepted24h: 9, autoRequeues24h: 1, actions24h: { 'invoice.send_requeued': 2, 'invoice.operator_reset': 1 } });
    expect(result.statuses.failed).toBe(2);
    expect(m.slack).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'metrics',
      text: expect.stringContaining('Naruszenia strażnika: brak'),
      context: expect.objectContaining({ failed: 2, naruszenia: 0 }),
    }));
  });
});

describe('alarm strażnika w monitorze (W3)', () => {
  it('bez naruszeń nic nie wysyła', async () => {
    await expect(checkKsefLifecycleViolations()).resolves.toEqual({ type: 'ksef_lifecycle_violations', fired: false });
    expect(m.alertCritical).not.toHaveBeenCalled();
  });

  it('naruszenia → alertCritical z liczbą per inwariant i linkiem do /admin/ksef, potem dedup', async () => {
    m.violations = [{ invariant: 'I1' }, { invariant: 'I1' }, { invariant: 'I9' }];

    await expect(checkKsefLifecycleViolations()).resolves.toEqual({ type: 'ksef_lifecycle_violations', fired: true });
    expect(m.alertCritical).toHaveBeenCalledWith(
      expect.stringContaining('Strażnik cyklu życia'),
      expect.any(String),
      expect.objectContaining({
        fields: [{ label: 'I1', value: '2' }, { label: 'I9', value: '1' }],
        link: expect.objectContaining({ url: expect.stringContaining('/admin/ksef') }),
      }),
    );
    expect(m.cacheSet).toHaveBeenCalledWith(expect.stringContaining('ksef_lifecycle_violations:I1+I9'), expect.any(String), expect.any(Number));

    m.cacheGet.mockResolvedValue('2026-10-03T12:00:00.000Z');
    await expect(checkKsefLifecycleViolations()).resolves.toMatchObject({ fired: false, reason: 'dedup' });
  });
});
