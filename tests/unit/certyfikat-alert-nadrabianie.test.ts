import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  tenants: [] as Row[],
  audit: [] as Row[],
  auditReadError: null as { message: string } | null,
  adminEmail: (id: string) => `admin-${id}@firma.test` as string | null,
  email: vi.fn(),
  push: vi.fn(),
  proposal: vi.fn(),
  slack: vi.fn(),
  queriedTables: [] as string[],
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/supabase/admin-queries', () => ({
  getTenantAdminEmail: async (id: string) => mocks.adminEmail(id),
}));
vi.mock('@/lib/email/send', () => ({ sendCertExpiryAlert: mocks.email }));
vi.mock('@/lib/push/sender', () => ({ sendPushToTenant: mocks.push }));
vi.mock('@/lib/flo/proposals', () => ({ createProposal: mocks.proposal }));
vi.mock('@/lib/alerts/slack', () => ({ sendSlackAlert: mocks.slack }));
vi.mock('@/lib/audit/log-system', () => ({
  logAuditSystem: async (entry: Row) => {
    mocks.audit.push({
      tenant_id: entry.tenantId,
      action: entry.action,
      metadata: entry.metadata,
      created_at: new Date().toISOString(),
    });
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => ({
    from(table: string) {
      mocks.queriedTables.push(table);
      const predicates: Array<(r: Row) => boolean> = [];
      const q = {
        select: () => q,
        eq(k: string, v: unknown) { predicates.push((r) => r[k] === v); return q; },
        in(k: string, v: unknown[]) { predicates.push((r) => v.includes(r[k])); return q; },
        gt(k: string, v: string) { predicates.push((r) => String(r[k]) > v); return q; },
        gte(k: string, v: string) { predicates.push((r) => String(r[k]) >= v); return q; },
        lte(k: string, v: string) { predicates.push((r) => String(r[k]) <= v); return q; },
        not() { return q; },
        order() { return q; },
        limit() { return q; },
        then(ok: (v: unknown) => unknown) {
          if (table === 'audit_logs' && mocks.auditReadError) {
            return Promise.resolve({ data: null, error: mocks.auditReadError }).then(ok);
          }
          const source = table === 'tenants' ? mocks.tenants : table === 'audit_logs' ? mocks.audit : [];
          return Promise.resolve({ data: source.filter((r) => predicates.every((p) => p(r))), error: null }).then(ok);
        },
      };
      return q;
    },
  }),
}));

import { runCertExpiryAlert } from '@/lib/inngest/jobs/cert-expiry-alert';

/**
 * AUD-53: ostrzeżenie o certyfikacie KSeF szło tylko w jednodniowych oknach
 * 30/14/7 dni. Jeden pominięty przebieg (awaria workera, wdrożenie w porze
 * crona) i firma nie dostawała ostrzeżenia na tym progu wcale; operator nie
 * wiedział nic. Teraz zadanie nadrabia najpilniejszy przekroczony próg,
 * pamięta wysłane (audit_logs) i zgłasza operatorowi pilne i niedostarczone.
 */

const DAY = 86_400_000;
const NOW = new Date('2026-10-02T06:00:00Z');
const za = (dni: number) => new Date(NOW.getTime() + dni * DAY).toISOString();

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};

const firma = (id: string, expiry: string): Row => ({ id, nip: '1234567890', name: `Firma ${id}`, ksef_certificate_expiry: expiry });
const wyslany = (tenantId: string, threshold: number, expiry: string): Row => ({
  tenant_id: tenantId,
  action: 'ksef.cert_expiry_alert',
  metadata: { threshold, expiry },
  created_at: new Date(NOW.getTime() - 10 * DAY).toISOString(),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  mocks.tenants = [];
  mocks.audit = [];
  mocks.auditReadError = null;
  mocks.queriedTables = [];
  mocks.adminEmail = (id) => `admin-${id}@firma.test`;
  mocks.email.mockResolvedValue({ sent: true });
  mocks.push.mockResolvedValue({ sent: 1, failed: 0 });
  mocks.proposal.mockResolvedValue({ status: 'created' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('certyfikat KSeF — nadrabianie progów (AUD-53)', () => {
  it('pominięte okno 30 dni: przy 20 dniach ostrzeżenie przychodzi, z prawdziwą liczbą dni', async () => {
    mocks.tenants = [firma('t1', za(19.5))];

    await runCertExpiryAlert(ctx);

    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(mocks.email.mock.calls[0]![1]).toMatchObject({ daysRemaining: 20 });
    expect(mocks.audit).toEqual([
      expect.objectContaining({ tenant_id: 't1', action: 'ksef.cert_expiry_alert', metadata: expect.objectContaining({ threshold: 30 }) }),
    ]);
  });

  it('próg już wysłany dla tej daty wygaśnięcia — następnego dnia cisza', async () => {
    mocks.tenants = [firma('t1', za(18.5))];
    mocks.audit = [wyslany('t1', 30, za(18.5))];

    await runCertExpiryAlert(ctx);

    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('pominięty próg 14: przy 6,5 dnia idzie od razu najpilniejszy (7), jeden mail', async () => {
    const expiry = za(6.5);
    mocks.tenants = [firma('t1', expiry)];
    mocks.audit = [wyslany('t1', 30, expiry)];

    await runCertExpiryAlert(ctx);

    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(mocks.email.mock.calls[0]![1]).toMatchObject({ daysRemaining: 7 });
    expect(mocks.audit.at(-1)).toMatchObject({ metadata: expect.objectContaining({ threshold: 7 }) });
  });

  it('nowy certyfikat (inna data wygaśnięcia) zaczyna progi od nowa', async () => {
    mocks.tenants = [firma('t1', za(25))];
    mocks.audit = [wyslany('t1', 7, za(-40))];

    await runCertExpiryAlert(ctx);

    expect(mocks.email).toHaveBeenCalledTimes(1);
  });

  it('certyfikat dalej niż 30 dni albo już wygasły — bez ostrzeżenia o progu', async () => {
    mocks.tenants = [firma('daleko', za(45)), firma('wygasl', za(-1))];

    await runCertExpiryAlert(ctx);

    expect(mocks.email).not.toHaveBeenCalled();
  });

  it('niedostarczone (brak maila i pusha) nie jest zapisane — jutro kolejna próba, operator wie dziś', async () => {
    mocks.tenants = [firma('t1', za(20))];
    mocks.adminEmail = () => null;
    mocks.push.mockResolvedValue({ sent: 0, failed: 0 });

    await runCertExpiryAlert(ctx);

    expect(mocks.audit).toEqual([]);
    expect(mocks.slack).toHaveBeenCalledTimes(1);
    expect(mocks.slack.mock.calls[0]![0]).toMatchObject({ channel: 'urgent' });
    expect(JSON.stringify(mocks.slack.mock.calls[0]![0])).toContain('t1');
  });

  it('ostatni próg (7 dni) zgłaszany operatorowi także po dostarczeniu', async () => {
    mocks.tenants = [firma('pilna', za(5)), firma('spokojna', za(25))];

    await runCertExpiryAlert(ctx);

    expect(mocks.slack).toHaveBeenCalledTimes(1);
    const wiadomosc = JSON.stringify(mocks.slack.mock.calls[0]![0]);
    expect(wiadomosc).toContain('pilna');
    expect(wiadomosc).not.toContain('spokojna');
  });

  it('spokojny dzień — operator nie dostaje nic', async () => {
    mocks.tenants = [firma('t1', za(25))];

    await runCertExpiryAlert(ctx);

    expect(mocks.slack).not.toHaveBeenCalled();
  });

  it('błąd odczytu wysłanych ostrzeżeń przerywa, zamiast wysłać wszystkim ponownie', async () => {
    mocks.tenants = [firma('t1', za(20))];
    mocks.auditReadError = { message: 'timeout' };

    await expect(runCertExpiryAlert(ctx)).rejects.toThrow(/timeout/);
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it('karta FLO powstaje na nadrobionym progu i nie pyta globalnego ksef_health_log', async () => {
    mocks.tenants = [firma('t1', za(20))];

    await runCertExpiryAlert(ctx);

    expect(mocks.proposal).toHaveBeenCalledTimes(1);
    expect(mocks.queriedTables).not.toContain('ksef_health_log');
  });
});
