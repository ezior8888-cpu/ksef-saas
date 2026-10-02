import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

/**
 * AUD-15 (decyzja P1): po terminie Offline24 wpis przechodził w `expired`,
 * a faktura w `failed` — bez dalszej wysyłki, a operator dowiadywał się
 * dopiero przy ≥ 50 wpisach. Faktury nadal trzeba dosłać do KSeF, więc
 * kolejka próbuje dalej, a przy pierwszym przekroczeniu terminu alarmuje
 * operatora i klienta — raz (znacznik `user_notified`).
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
          if (table === 'invoices') return { data: { ksef_status: 'offline_queued', ksef_number: null, invoice_type: 'VAT', invoice_kind: 'regular', last_error_code: null }, error: null };
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
    status: 'queued', attempts: 3, deadline: '2026-09-01T21:59:59.999Z', user_notified: false, idempotency_key: 'k',
  };
  mocks.alert.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue({ sent: 1, failed: 0 });
});

describe('Offline24 po terminie', () => {
  it('nie wygasza wpisu i nie oznacza faktury jako failed — wysyła dalej', async () => {
    await runProcessOfflineQueue(ctx);
    expect(db.updates.some((u) => u.patch.status === 'expired')).toBe(false);
    expect(db.updates.some((u) => u.table === 'invoices' && u.patch.ksef_status === 'failed')).toBe(false);
    expect(mocks.sendEvent).toHaveBeenCalledWith(expect.stringContaining('submit-from-offline'), expect.anything());
  });

  it('pierwsze przekroczenie: alarm dla operatora i powiadomienie klienta, znacznik user_notified', async () => {
    await runProcessOfflineQueue(ctx);
    expect(mocks.alert).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.alert.mock.calls)).not.toContain('1234567890');
    expect(mocks.push).toHaveBeenCalledWith(db.item.tenant_id, 'invoice_rejected', expect.objectContaining({ title: expect.any(String) }));
    expect(db.updates).toContainEqual({ table: 'ksef_offline_queue', patch: { user_notified: true } });
  });

  it('kolejne przebiegi po terminie nie powtarzają alarmu', async () => {
    db.item = { ...db.item, user_notified: true };
    await runProcessOfflineQueue(ctx);
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
