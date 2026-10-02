import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

/**
 * AUD-15 (decyzja P1) zakładał, że kolejka po terminie dalej wysyła. Od
 * 02.10.2026 (decyzja Bartosza przy przeniesieniu #71) automatyczny Offline24
 * jest wstrzymany: kolejka niczego nie wysyła, wpisy po terminie wygasają,
 * a pozostałe idą do ręcznego uzgodnienia. Alarm o zaległych wpisach daje
 * monitor krytyczny, nie ten job.
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ item: {} as Row, updates: [] as Array<{ table: string; patch: Row }> }));
const mocks = vi.hoisted(() => ({ alert: vi.fn(), push: vi.fn(), sendEvent: vi.fn() }));

vi.mock('@/lib/inngest/jobs/tenant-boundary', () => ({
  requireInvoiceTenant: vi.fn(),
  InvoiceTenantMismatchError: class InvoiceTenantMismatchError extends Error {},
}));
vi.mock('@/lib/supabase/admin-queries', () => ({
  getInvoiceForSubmit: async () => ({ internalNumber: 'FV/1/2026', type: 'VAT', issueDate: '2026-10-01' }),
  updateInvoiceStatus: vi.fn(),
  getTenantKsefCredentials: vi.fn(),
}));
vi.mock('@/lib/ksef/health-check', () => ({
  checkKsefAvailability: async () => ({ available: true }),
  shouldUseOfflineMode: vi.fn(),
}));
vi.mock('@/lib/flo/proposals', () => ({ createProposal: vi.fn() }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
vi.mock('@/lib/alerts/slack', () => ({ alertCritical: mocks.alert }));
vi.mock('@/lib/push/sender', () => ({ sendPushToTenant: mocks.push }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let patch: Row | null = null;
      let selected = false;
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => { selected = true; return q; },
        eq: () => q, lte: () => q, order: () => q, in: () => q, or: () => q, is: () => q,
        update: (p: Row) => { patch = p; return q; },
        limit: async () => ({ data: [db.item], error: null }),
        single: async () => ({ data: { nip: '1234567890' }, error: null }),
        maybeSingle: async () => {
          if (patch) {
            db.updates.push({ table, patch });
            return { data: table === 'ksef_offline_queue' ? { id: db.item.id } : { id: db.item.invoice_id }, error: null };
          }
          if (table === 'invoices') return { data: { ksef_status: 'offline_queued', ksef_number: null, ksef_environment: 'test', invoice_type: 'VAT', invoice_kind: 'regular', fa3_data: { type: 'VAT' }, last_error_code: null }, error: null };
          return { data: { status: 'sending' }, error: null };
        },
        then: (ok: (v: unknown) => unknown) => {
          if (patch) db.updates.push({ table, patch });
          void selected;
          return Promise.resolve({ error: null }).then(ok);
        },
      });
      return q;
    },
  }),
}));

import { runProcessOfflineQueue } from '@/lib/inngest/jobs/process-offline-queue';

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: mocks.sendEvent, scheduleAfter: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.updates = [];
  db.item = {
    id: 'q1', tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', invoice_id: '11111111-1111-4111-8111-111111111111',
    status: 'queued', ksef_environment: 'test', attempts: 3, deadline: '2026-09-01T21:59:59.999Z', user_notified: false, idempotency_key: 'k',
  };
  mocks.alert.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue({ sent: 1, failed: 0 });
});

describe('Offline24 po terminie — kolejka wstrzymana (decyzja 02.10.2026)', () => {
  it('wpis po terminie wygasa, a kolejka niczego nie wysyła', async () => {
    await runProcessOfflineQueue(ctx);
    expect(db.updates.some((u) => u.table === 'ksef_offline_queue' && u.patch.status === 'expired')).toBe(true);
    expect(mocks.sendEvent).not.toHaveBeenCalled();
  });

  it('wpis przed terminem idzie do ręcznego uzgodnienia, bez wysyłki', async () => {
    db.item = { ...db.item, deadline: '2099-01-01T21:59:59.999Z' };
    await runProcessOfflineQueue(ctx);
    expect(db.updates.some((u) => u.table === 'ksef_offline_queue' && u.patch.status === 'failed')).toBe(true);
    expect(mocks.sendEvent).not.toHaveBeenCalled();
  });

  it('job kolejki nie wysyła alarmu ani powiadomienia sam (robi to monitor)', async () => {
    await runProcessOfflineQueue(ctx);
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
