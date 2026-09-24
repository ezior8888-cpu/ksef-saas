import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  paymentRead: vi.fn(),
  paymentUpsert: vi.fn(),
  subscriptionRead: vi.fn(),
  subscriptionUpsert: vi.fn(),
  subscriptionUpdate: vi.fn(),
  subscriptionDeleteResult: vi.fn(),
  mapInvoice: vi.fn(),
  mapSubscription: vi.fn(),
  resolveTenant: vi.fn(),
  sendJob: vi.fn(),
  audit: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/stripe/event-mapping', () => ({
  mapInvoiceToPaymentRow: mocks.mapInvoice,
  mapSubscriptionToRow: mocks.mapSubscription,
  resolveTenantIdFromSubscription: mocks.resolveTenant,
}));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.sendJob }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: mocks.track }));
vi.mock('@/lib/analytics/events', () => ({
  ANALYTICS_EVENTS: {
    paymentSucceeded: 'payment_succeeded',
    paymentFailed: 'payment_failed',
    subscriptionCreated: 'subscription_created',
    subscriptionCanceled: 'subscription_canceled',
  },
}));
vi.mock('@/lib/inngest/client', () => ({
  billingPaymentSucceeded: { create: (data: unknown) => ({ name: 'billing/payment.succeeded', data }) },
  billingPaymentFailed: { create: (data: unknown) => ({ name: 'billing/payment.failed', data }) },

}));

import {
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  handleSubscriptionDeleted,
  handleSubscriptionUpserted,
  handleTrialWillEnd,
} from '@/lib/stripe/webhook-handlers';
import { RetryablePreEffectWebhookError } from '@/lib/stripe/webhook-errors';

const invoice = {
  id: 'in_ordered',
  amount_due: 12000,
  currency: 'pln',
} as unknown as Stripe.Invoice;

const subscription = {
  id: 'sub_ordered',
  status: 'active',
  canceled_at: 1780000000,
  items: { data: [{ price: { id: 'price_monthly' } }] },
} as unknown as Stripe.Subscription;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.mapInvoice.mockResolvedValue({
    tenantId: 'tenant-a',
    row: { stripe_invoice_id: invoice.id, status: 'failed', failure_reason: 'card declined' },
  });
  mocks.mapSubscription.mockReturnValue({
    tenant_id: 'tenant-a',
    stripe_subscription_id: subscription.id,
    stripe_customer_id: 'cus_ordered',
    stripe_price_id: 'price_monthly',
    status: 'active',
  });
  mocks.resolveTenant.mockResolvedValue('tenant-a');
  mocks.paymentRead.mockResolvedValue({ data: null, error: null });
  mocks.paymentUpsert.mockReturnValue({
    select: async () => ({ data: [{ id: 'payment-local', status: 'failed' }], error: null }),
  });
  mocks.subscriptionRead.mockResolvedValue({ data: { status: 'canceled' }, error: null });
  mocks.subscriptionUpsert.mockReturnValue({
    select: async () => ({ data: [{ status: 'active' }], error: null }),
  });
  mocks.subscriptionDeleteResult.mockResolvedValue({
    data: { id: 'local-subscription', status: 'canceled' }, error: null,
  });
  mocks.subscriptionUpdate.mockReturnValue({
    eq: () => ({
      eq: () => ({ select: () => ({ maybeSingle: mocks.subscriptionDeleteResult }) }),
    }),
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'stripe_payments') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: mocks.paymentRead }) }),
        upsert: mocks.paymentUpsert,
      };
    }
    if (table === 'subscriptions') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: mocks.subscriptionRead }) }),
        upsert: mocks.subscriptionUpsert,
        update: mocks.subscriptionUpdate,
      };
    }
    throw new Error('Unexpected table: ' + table);
  });
  mocks.sendJob.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
  mocks.track.mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('Stripe webhook event ordering', () => {
  it.each(['succeeded', 'refunded', 'partially_refunded'])(
    'does not downgrade a payment already %s to failed', async (status) => {
      mocks.paymentRead.mockResolvedValue({ data: { status }, error: null });

      await handleInvoicePaymentFailed(invoice);

      expect(mocks.paymentUpsert).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
      expect(mocks.sendJob).not.toHaveBeenCalled();
      expect(mocks.track).not.toHaveBeenCalled();
    },
  );

  it.each(['succeeded', 'refunded', 'partially_refunded'])(
    'does not send dunning if the persisted row became %s after the read', async (status) => {
      mocks.paymentUpsert.mockReturnValue({
        select: async () => ({ data: [{ id: 'payment-local', status }], error: null }),
      });

      await handleInvoicePaymentFailed(invoice);

      expect(mocks.paymentUpsert).toHaveBeenCalledOnce();
      expect(mocks.audit).not.toHaveBeenCalled();
      expect(mocks.sendJob).not.toHaveBeenCalled();
      expect(mocks.track).not.toHaveBeenCalled();
    },
  );

  it('does not send dunning when the DB guard suppresses a stale failed upsert', async () => {
    mocks.paymentRead
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { status: 'succeeded' }, error: null });
    mocks.paymentUpsert.mockReturnValue({
      select: async () => ({ data: [], error: null }),
    });

    await handleInvoicePaymentFailed(invoice);

    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.sendJob).not.toHaveBeenCalled();
  });

  it('retries a failed payment event when the write has no row and no terminal payment exists', async () => {
    mocks.paymentUpsert.mockReturnValue({
      select: async () => ({ data: [], error: null }),
    });

    await expect(handleInvoicePaymentFailed(invoice))
      .rejects.toThrow('stripe payment failure upsert affected no row');
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.sendJob).not.toHaveBeenCalled();
  });

  it('retries a succeeded payment event when its write has no row', async () => {
    mocks.paymentUpsert.mockReturnValue({
      select: async () => ({ data: [], error: null }),
    });

    await expect(handleInvoicePaymentSucceeded(invoice))
      .rejects.toThrow('stripe payment success upsert affected no row');
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.sendJob).not.toHaveBeenCalled();
  });

  it('still processes a persisted failed payment', async () => {
    await handleInvoicePaymentFailed(invoice);

    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.sendJob).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledOnce();
  });

  it('creates a canceled tombstone when deleted arrives before created', async () => {
    mocks.subscriptionDeleteResult.mockResolvedValue({ data: null, error: null });
    mocks.subscriptionUpsert.mockReturnValue({
      select: async () => ({
        data: [{ id: 'local-subscription', tenant_id: 'tenant-a', status: 'canceled' }],
        error: null,
      }),
    });

    await handleSubscriptionDeleted(subscription);

    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'tenant-a', status: 'canceled' }),
      { onConflict: 'stripe_subscription_id', ignoreDuplicates: true },
    );
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.sendJob).not.toHaveBeenCalled();
  });

  it('does not emit cancellation effects for an existing other-tenant subscription', async () => {
    mocks.subscriptionDeleteResult.mockResolvedValue({ data: null, error: null });
    mocks.subscriptionUpsert.mockReturnValue({
      select: async () => ({ data: [], error: null }),
    });

    await expect(handleSubscriptionDeleted(subscription))
      .rejects.toThrow('subscription delete not persisted for tenant');
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.sendJob).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('cancels a same-tenant row created during the tombstone race', async () => {
    mocks.subscriptionDeleteResult
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'local-subscription', status: 'canceled' }, error: null });
    mocks.subscriptionUpsert.mockReturnValue({
      select: async () => ({ data: [], error: null }),
    });

    await handleSubscriptionDeleted(subscription);

    expect(mocks.subscriptionDeleteResult).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it('processes deletion only after updating the stored subscription', async () => {
    await handleSubscriptionDeleted(subscription);

    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(mocks.sendJob).not.toHaveBeenCalled();
  });

  it('suppresses a stale subscription update after persisted cancellation', async () => {
    mocks.subscriptionUpsert.mockReturnValue({
      select: async () => ({ data: [], error: null }),
    });

    await handleSubscriptionUpserted(subscription, false);

    expect(mocks.subscriptionRead).toHaveBeenCalledOnce();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('retries an unexplained zero-row subscription upsert', async () => {
    mocks.subscriptionUpsert.mockReturnValue({
      select: async () => ({ data: [], error: null }),
    });
    mocks.subscriptionRead.mockResolvedValue({ data: null, error: null });

    await expect(handleSubscriptionUpserted(subscription, false))
      .rejects.toThrow('subscription upsert affected no row');
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('checks a returned terminal status before auditing a stale update', async () => {
    mocks.subscriptionUpsert.mockReturnValue({
      select: async () => ({ data: [{ status: 'canceled' }], error: null }),
    });

    await handleSubscriptionUpserted(subscription, false);

    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it.each([
    ['created', () => handleSubscriptionUpserted(subscription, true)],
    ['updated', () => handleSubscriptionUpserted(subscription, false)],
    ['deleted', () => handleSubscriptionDeleted(subscription)],
    ['trial ending', () => handleTrialWillEnd(subscription)],
  ])('propagates a retryable missing-tenant failure before %s effects', async (_event, invoke) => {
    mocks.resolveTenant.mockRejectedValue(new RetryablePreEffectWebhookError(
      'tenant_id_missing', 'tenant not resolved',
    ));

    await expect(invoke()).rejects.toMatchObject({
      name: 'RetryablePreEffectWebhookError', code: 'tenant_id_missing',
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.sendJob).not.toHaveBeenCalled();
  });

  it.each(['inngest', 'pgboss'] as const)(
    'finishes canceled and trial-ending webhook handlers without phantom queue events on %s',
    async (backend) => {
      vi.stubEnv('JOBS_BACKEND', backend);
      mocks.sendJob.mockRejectedValue(new Error('enqueue must not happen'));

      await expect(handleSubscriptionDeleted(subscription)).resolves.toBeUndefined();
      await expect(handleTrialWillEnd(subscription)).resolves.toBeUndefined();

      expect(mocks.audit).toHaveBeenCalledTimes(2);
      expect(mocks.track).toHaveBeenCalledOnce();
      expect(mocks.sendJob).not.toHaveBeenCalled();
    },
  );

});
