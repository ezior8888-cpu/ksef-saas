import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  alertCritical: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('inngest', () => ({ cron: vi.fn((schedule: string) => schedule) }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/lib/alerts/slack', () => ({ alertCritical: mocks.alertCritical }));
vi.mock('@/lib/cache', () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/inngest/client', () => ({
  inngest: { createFunction: vi.fn() },
}));

import {
  checkStaleBillingVatEnqueues,
  runCriticalAlertsMonitor,
} from '@/lib/inngest/jobs/critical-alerts-monitor';

function queryResult(count: number | null, error: Error | null = null) {
  const query = {
    select: vi.fn(),
    not: vi.fn(),
    is: vi.fn(),
    lt: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.lt.mockResolvedValue({ count, error });
  mocks.from.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T12:00:00.000Z'));
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.alertCritical.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('stale billing VAT enqueue alert', () => {
  it('counts VAT-linked payments older than 15 minutes using the invoice creation time', async () => {
    const query = queryResult(2);

    await expect(checkStaleBillingVatEnqueues()).resolves.toEqual({
      type: 'stale_billing_vat_enqueues', fired: true,
    });

    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('stripe_payments');
    expect(query.select).toHaveBeenCalledExactlyOnceWith(
      'id, invoices!stripe_payments_vat_invoice_id_fkey!inner(created_at)',
      { count: 'exact', head: true },
    );
    expect(query.not).toHaveBeenCalledExactlyOnceWith('vat_invoice_id', 'is', null);
    expect(query.is).toHaveBeenCalledExactlyOnceWith('vat_invoice_submitted_at', null);
    expect(query.lt).toHaveBeenCalledExactlyOnceWith(
      'invoices.created_at', '2026-09-25T11:45:00.000Z',
    );
    expect(mocks.cacheSet).toHaveBeenCalledExactlyOnceWith(
      'alerts:critical:lastsent:stale_billing_vat_enqueues',
      '2026-09-25T12:00:00.000Z',
      30 * 60,
    );
    const alert = JSON.stringify(mocks.alertCritical.mock.calls[0]);
    expect(alert).toContain('kolejki i KSeF');
    expect(alert).toContain('nie wysyłaj zlecenia automatycznie ponownie');
    expect(alert).not.toContain('payment_id');
    expect(alert).not.toContain('invoice_id');
  });

  it('stays quiet with no stale links or an active dedup claim', async () => {
    queryResult(0);
    await expect(checkStaleBillingVatEnqueues()).resolves.toEqual({
      type: 'stale_billing_vat_enqueues', fired: false,
    });
    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(mocks.alertCritical).not.toHaveBeenCalled();

    queryResult(1);
    mocks.cacheGet.mockResolvedValue('already-sent');
    await expect(checkStaleBillingVatEnqueues()).resolves.toEqual({
      type: 'stale_billing_vat_enqueues', fired: false, reason: 'dedup',
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('fails closed when the count query errors or returns null', async () => {
    const failure = new Error('database unavailable');
    queryResult(null, failure);
    await expect(checkStaleBillingVatEnqueues()).rejects.toBe(failure);

    queryResult(null);
    await expect(checkStaleBillingVatEnqueues()).rejects.toThrow(
      'Stale billing VAT enqueue count unavailable',
    );
    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('runs the VAT check in the shared monitor used by both job backends', async () => {
    const query = {
      select: vi.fn(), eq: vi.fn(), not: vi.fn(), is: vi.fn(),
      in: vi.fn(), gte: vi.fn(), lt: vi.fn(), order: vi.fn(),
      then: vi.fn(),
    };
    for (const name of ['select', 'eq', 'not', 'is', 'in', 'gte', 'lt'] as const) {
      query[name].mockReturnValue(query);
    }
    query.order.mockResolvedValue({ data: [], error: null });
    query.then.mockImplementation((resolve: (value: unknown) => void) =>
      Promise.resolve({ count: 0, error: null, data: [] }).then(resolve));
    mocks.from.mockReturnValue(query);
    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    } as unknown as JobContext['step'];

    const result = await runCriticalAlertsMonitor({ step } as JobContext);

    expect(step.run).toHaveBeenCalledWith('check-stale-billing-vat-enqueues', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('check-checkout-attempts', expect.any(Function));
    expect(result).toMatchObject({ checked: 10, fired: 0 });
  });
});
