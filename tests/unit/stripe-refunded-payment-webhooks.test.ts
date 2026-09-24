import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  paymentStatusRead: vi.fn(),
  mapInvoice: vi.fn(),
  sendJob: vi.fn(),
  audit: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/stripe/event-mapping', () => ({
  mapInvoiceToPaymentRow: mocks.mapInvoice,
  mapSubscriptionToRow: vi.fn(),
  resolveTenantIdFromSubscription: vi.fn(),
}));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.sendJob }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: mocks.track }));
vi.mock('@/lib/analytics/events', () => ({
  ANALYTICS_EVENTS: { paymentSucceeded: 'payment_succeeded', paymentFailed: 'payment_failed' },
}));
vi.mock('@/lib/inngest/client', () => ({
  billingPaymentSucceeded: { create: (data: unknown) => ({ name: 'billing/payment.succeeded', data }) },
  billingPaymentFailed: { create: (data: unknown) => ({ name: 'billing/payment.failed', data }) },
  billingSubscriptionCanceled: { create: vi.fn() },
  billingTrialWillEnd: { create: vi.fn() },
}));

import {
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
} from '@/lib/stripe/webhook-handlers';

const invoice = {
  id: 'in_local',
  amount_paid: 12000,
  amount_due: 12000,
  currency: 'pln',
  status_transitions: { paid_at: 1780000000 },
} as unknown as Stripe.Invoice;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.mapInvoice.mockResolvedValue({
    tenantId: 'tenant-local',
    row: { stripe_invoice_id: 'in_local', status: 'succeeded' },
  });
  mocks.paymentStatusRead.mockResolvedValue({ data: { status: 'refunded' }, error: null });
  mocks.upsert.mockReturnValue({
    select: async () => ({ data: [{ id: 'payment-local' }], error: null }),
  });
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'stripe_payments') throw new Error('Unexpected table: ' + table);
    return {
      select: () => ({
        eq: () => ({ maybeSingle: mocks.paymentStatusRead }),
      }),
      upsert: mocks.upsert,
    };
  });
  mocks.sendJob.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
  mocks.track.mockResolvedValue(undefined);
});

describe('late Stripe invoice webhooks after a refund', () => {
  it.each([
    ['succeeded', handleInvoicePaymentSucceeded, 'refunded'],
    ['failed', handleInvoicePaymentFailed, 'refunded'],
    ['succeeded', handleInvoicePaymentSucceeded, 'partially_refunded'],
    ['failed', handleInvoicePaymentFailed, 'partially_refunded'],
  ])('skips %s when payment is %s', async (_eventType, handler, status) => {
    mocks.paymentStatusRead.mockResolvedValue({ data: { status }, error: null });

    await handler(invoice);

    expect(mocks.paymentStatusRead).toHaveBeenCalledOnce();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.sendJob).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('still processes a payment that has not been refunded', async () => {
    mocks.paymentStatusRead.mockResolvedValue({ data: { status: 'succeeded' }, error: null });

    await handleInvoicePaymentSucceeded(invoice);

    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.sendJob).toHaveBeenCalledOnce();
  });

  it('fails for retry if the existing payment status cannot be read', async () => {
    mocks.paymentStatusRead.mockResolvedValue({
      data: null, error: { message: 'temporary database outage' },
    });

    await expect(handleInvoicePaymentSucceeded(invoice)).rejects.toThrow(
      'stripe payment status read failed',
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each([
    ['succeeded', handleInvoicePaymentSucceeded],
    ['failed', handleInvoicePaymentFailed],
  ])('skips %s side effects when refund wins after the initial read', async (_eventType, handler) => {
    mocks.paymentStatusRead.mockResolvedValue({ data: { status: 'succeeded' }, error: null });
    mocks.upsert.mockReturnValue({
      select: async () => ({ data: [{ id: 'payment-local', status: 'refunded' }], error: null }),
    });

    await handler(invoice);

    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.sendJob).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('skips side effects when the database trigger suppresses a stale upsert', async () => {
    mocks.paymentStatusRead.mockResolvedValue({ data: { status: 'succeeded' }, error: null });
    mocks.upsert.mockReturnValue({
      select: async () => ({ data: [], error: null }),
    });

    await handleInvoicePaymentSucceeded(invoice);

    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.sendJob).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});