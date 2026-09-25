import { NonRetriableError } from 'inngest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';
import type { Invoice } from '@/types/invoice';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  queueRow: null as Row | null,
  updates: [] as Array<{ table: string; patch: Row }>,
}));
const mocks = vi.hoisted(() => ({ status: vi.fn(), sendEvent: vi.fn() }));

vi.mock('@/lib/inngest/jobs/tenant-boundary', () => ({
  requireInvoiceTenant: vi.fn(),
  InvoiceTenantMismatchError: class InvoiceTenantMismatchError extends Error {},
}));
vi.mock('@/lib/supabase/admin-queries', () => ({
  updateInvoiceStatus: mocks.status,
  getInvoiceForSubmit: vi.fn(),
  getTenantKsefCredentials: vi.fn(),
}));
vi.mock('@/lib/ksef/health-check', () => ({
  checkKsefAvailability: vi.fn(),
  shouldUseOfflineMode: vi.fn(),
}));
vi.mock('@/lib/flo/proposals', () => ({ createProposal: vi.fn() }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => {
    const q: Record<string, unknown> = {};
    let patch: Row | null = null;
    let table = '';
    Object.assign(q, {
      select: () => q,
      eq: () => q,
      update: (p: Row) => {
        patch = p;
        return q;
      },
      maybeSingle: async () => ({ data: db.queueRow, error: null }),
      then: (ok: (v: unknown) => unknown) => {
        if (patch) db.updates.push({ table, patch });
        return Promise.resolve({ error: null }).then(ok);
      },
    });
    return {
      from: (t: string) => {
        table = t;
        patch = null;
        return q;
      },
    };
  },
}));

import { runOfflineQueueFailure } from '@/lib/inngest/jobs/process-offline-queue';
import { onSubmitInvoiceExhausted } from '@/lib/inngest/jobs/submit-invoice';

/**
 * Faktura wysłana z kolejki Offline24 i odrzucona na stałe (treść, brak
 * danych korekty — #48/#49) wracała do 'queued' i była ponawiana do upływu
 * terminu. Zdarzenie niosło tylko tekst błędu, bez rodzaju zakończenia.
 * (Uwaga recenzji ChatGPT nr 3, 25.09.2026.)
 */

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: mocks.sendEvent, scheduleAfter: vi.fn() },
};
const INV = '11111111-1111-4111-8111-111111111111';
const TEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  vi.clearAllMocks();
  db.queueRow = { id: 'q1', attempts: 2, status: 'sending' };
  db.updates = [];
});

describe('kolejka Offline24 po nieudanej wysyłce', () => {
  it('błąd kończący: wpis zamknięty jako failed, status faktury nietknięty', async () => {
    await runOfflineQueueFailure(
      { invoiceId: INV, tenantId: TEN, error: 'KSeF odrzucił fakturę', fromOfflineQueue: true, terminal: true },
      ctx,
    );
    expect(db.updates).toEqual([
      { table: 'ksef_offline_queue', patch: { status: 'failed', last_error: 'KSeF odrzucił fakturę' } },
    ]);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('błąd przejściowy: wraca do kolejki jak dotąd', async () => {
    await runOfflineQueueFailure(
      { invoiceId: INV, tenantId: TEN, error: 'ECONNRESET', fromOfflineQueue: true, terminal: false },
      ctx,
    );
    expect(db.updates[0]?.patch.status).toBe('queued');
    expect(mocks.status).toHaveBeenCalledWith(INV, expect.objectContaining({ ksef_status: 'offline_queued' }), TEN);
  });

  it('zdarzenie sprzed zmiany (bez pola terminal) zachowuje się jak dotąd', async () => {
    await runOfflineQueueFailure({ invoiceId: INV, tenantId: TEN, error: 'x', fromOfflineQueue: true }, ctx);
    expect(db.updates[0]?.patch.status).toBe('queued');
  });
});

describe('job wysyłki mówi kolejce, czy błąd jest kończący', () => {
  const zdarzenie = {
    invoiceId: INV,
    tenantId: TEN,
    nip: '1234567890',
    invoice: { internalNumber: 'FV 1/2026', type: 'VAT' } as Invoice,
    fromOfflineQueue: true,
  };
  const wyslane = () =>
    mocks.sendEvent.mock.calls.find((c) => c[0] === 'emit-failure')?.[1] as { data: Record<string, unknown> };

  it('NonRetriableError → terminal: true', async () => {
    await onSubmitInvoiceExhausted(new NonRetriableError('KSeF odrzucił fakturę'), zdarzenie, ctx);
    expect(wyslane().data.terminal).toBe(true);
  });

  it('inny błąd po wyczerpaniu prób → terminal: false', async () => {
    await onSubmitInvoiceExhausted(new Error('ECONNRESET'), zdarzenie, ctx);
    expect(wyslane().data.terminal).toBe(false);
  });
});
