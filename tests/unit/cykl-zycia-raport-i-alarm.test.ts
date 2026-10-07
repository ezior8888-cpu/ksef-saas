import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/**
 * D-A4-1b-3 PR B (decyzja 4, 07.10.2026): I5D — faktura czeka na decyzję
 * klienta przy nierozstrzygniętym 440 (00148). Nie alarm krytyczny (klient
 * dostał e-mail, operator widzi ją w raporcie i /admin/ksef) — chyba że dane
 * oryginału sprawdzono w innym środowisku KSeF niż obecne (I5D-env: klient
 * nie zapisze decyzji). W raporcie osobny wiersz, nie „Naruszenia strażnika”.
 */
const i5d = (env: string | null, attemptedAt = '2026-10-01T10:00:00.000Z') => ({
  invariant: 'I5D',
  detail: { original_ksef_number: '1234567890-20261001-0100A0B0C0D0-1A', reason: 'no-own-file', env, attempted_at: attemptedAt },
});

describe('D-A4-1b-3 PR B: I5D w monitorze alarmów', () => {
  beforeEach(() => {
    vi.stubEnv('KSEF_ENV', 'test');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('U19a: samo I5D w bieżącym środowisku — bez alarmu krytycznego', async () => {
    m.violations = [i5d('test'), i5d('test', '2026-10-02T10:00:00.000Z')];
    await expect(checkKsefLifecycleViolations()).resolves.toEqual({ type: 'ksef_lifecycle_violations', fired: false });
    expect(m.alertCritical).not.toHaveBeenCalled();
    expect(m.cacheSet).not.toHaveBeenCalled();
  });

  it('U19b: I5D z innego (albo nieznanego) środowiska — alarm jako I5D-env, z kluczem i zdaniem w treści', async () => {
    m.violations = [i5d('production'), i5d(null)];
    await expect(checkKsefLifecycleViolations()).resolves.toEqual({ type: 'ksef_lifecycle_violations', fired: true });
    expect(m.alertCritical).toHaveBeenCalledWith(
      expect.stringContaining('Strażnik cyklu życia'),
      expect.stringContaining('I5D-env: faktura czeka na decyzję klienta, ale dane oryginału sprawdzono w innym środowisku KSeF niż obecne — klient nie zapisze decyzji (runbook KSEF_DUPLICATE_RECONCILE, przełączenie środowiska).'),
      expect.objectContaining({ fields: [{ label: 'I5D-env', value: '2' }] }),
    );
    expect(m.cacheSet).toHaveBeenCalledWith(expect.stringMatching(/ksef_lifecycle_violations:I5D-env$/), expect.any(String), expect.any(Number));
  });

  it('U19b: I1 obok I5D w bieżącym środowisku — alarm tylko o I1 (klucz bez I5D)', async () => {
    m.violations = [{ invariant: 'I1' }, i5d('test')];
    await expect(checkKsefLifecycleViolations()).resolves.toEqual({ type: 'ksef_lifecycle_violations', fired: true });
    expect(m.alertCritical).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ fields: [{ label: 'I1', value: '1' }] }),
    );
    expect(m.cacheSet).toHaveBeenCalledWith(expect.stringMatching(/ksef_lifecycle_violations:I1$/), expect.any(String), expect.any(Number));
  });

  it('U19b: KSEF_ENV nieustawione — I5D nie da się zapisać w żadnym środowisku: I5D-env', async () => {
    vi.stubEnv('KSEF_ENV', '');
    m.violations = [i5d('test')];
    await expect(checkKsefLifecycleViolations()).resolves.toEqual({ type: 'ksef_lifecycle_violations', fired: true });
    expect(m.alertCritical).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ fields: [{ label: 'I5D-env', value: '1' }] }),
    );
  });
});

describe('D-A4-1b-3 PR B: I5D w raporcie dziennym', () => {
  beforeEach(() => {
    vi.stubEnv('KSEF_ENV', 'test');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('U19c: I5D osobnym wierszem (z innym środowiskiem), poza „Naruszeniami strażnika”; decyzje w akcjach doby', async () => {
    m.violations = [{ invariant: 'I1' }, i5d('test', '2026-10-02T10:00:00.000Z'), i5d('production', '2026-10-01T10:00:00.000Z')];
    m.audit = [
      { action: 'invoice.ksef_duplicate_decided', user_id: 'owner' },
      { action: 'invoice.operator_duplicate_decision', user_id: null },
      { action: 'invoice.ksef_duplicate_decision_notified', user_id: null },
    ];

    const result = await runKsefLifecycleReport(ctx);

    expect(result.violations).toEqual({ I1: 1 });
    const text = String((m.slack.mock.calls[0]?.[0] as { text?: string } | undefined)?.text);
    expect(text).toContain('Naruszenia strażnika: I1 1\n');
    expect(text).toMatch(/Czekają na decyzję klienta \(I5D\): 2 · w innym środowisku KSeF: 1 · najdłużej od .+/);
    expect(text).toContain('ksef_duplicate_decided 1');
    expect(text).toContain('operator_duplicate_decision 1');
    expect(text).toContain('ksef_duplicate_decision_notified 1');
    expect(m.slack).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ naruszenia: 1, czekaNaKlienta: 2 }),
    }));
  });

  it('U19c: same I5D — „Naruszenia strażnika: brak”, wiersz czekających bez innego środowiska', async () => {
    m.violations = [i5d('test')];
    await runKsefLifecycleReport(ctx);
    const text = String((m.slack.mock.calls[0]?.[0] as { text?: string } | undefined)?.text);
    expect(text).toContain('Naruszenia strażnika: brak');
    expect(text).toMatch(/Czekają na decyzję klienta \(I5D\): 1(?! · w innym)/);
    expect(m.slack).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ naruszenia: 0, czekaNaKlienta: 1 }) }));
  });

  it('U19c: formatLifecycleReport — wiersz CLIENT_PENDING_LINE po naruszeniach; bez pola — bez wiersza', () => {
    const base = {
      statuses: { draft: 0, failed: 1 },
      accepted24h: 0,
      violations: {},
      actions24h: {},
      autoRequeues24h: 0,
    };
    const lines = formatLifecycleReport({ ...base, clientDecisionPending: { count: 3, otherEnv: 0, oldestAttemptAt: null } }).split('\n');
    const at = lines.indexOf('Naruszenia strażnika: brak');
    expect(lines[at + 1]).toBe('Czekają na decyzję klienta (I5D): 3');
    expect(formatLifecycleReport(base)).not.toContain('Czekają na decyzję klienta');
  });
});
