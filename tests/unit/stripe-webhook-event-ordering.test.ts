import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  paymentRead: vi.fn(),
  paymentUpsert: vi.fn(),
  mapInvoice: vi.fn(),
  syncSubscription: vi.fn(),
  sendJob: vi.fn(),
  audit: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/stripe/event-mapping', () => ({
  mapInvoiceToPaymentRow: mocks.mapInvoice,
}));
vi.mock('@/lib/stripe/subscription-sync', () => ({
  syncCurrentStripeSubscription: mocks.syncSubscription,
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
  mocks.syncSubscription.mockResolvedValue({
    subscription,
    tenantId: 'tenant-a',
    status: 'active',
  });
  mocks.paymentRead.mockResolvedValue({ data: null, error: null });
  mocks.paymentUpsert.mockReturnValue({
    select: async () => ({ data: [{ id: 'payment-local', status: 'failed' }], error: null }),
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'stripe_payments') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: mocks.paymentRead }) }),
        upsert: mocks.paymentUpsert,
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

  it('uses a fresh canceled state for a delayed created event without false activation analytics', async () => {
    const freshCanceled = {
      ...subscription,
      status: 'canceled',
      items: { data: [{ price: { id: 'price_annual' } }] },
    } as Stripe.Subscription;
    mocks.syncSubscription.mockResolvedValue({
      subscription: freshCanceled,
      tenantId: 'tenant-a',
      status: 'canceled',
    });

    await handleSubscriptionUpserted(subscription, true);

    expect(mocks.syncSubscription).toHaveBeenCalledExactlyOnceWith(subscription.id);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'billing.subscription.synced',
      metadata: expect.objectContaining({
        sourceEvent: 'created',
        status: 'canceled',
        priceId: 'price_annual',
      }),
    }));
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.sendJob).not.toHaveBeenCalled();
  });

  it('tracks a created subscription only when the fetched state is live', async () => {
    await handleSubscriptionUpserted(subscription, true);

    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({
      event: 'subscription_created',
      properties: expect.objectContaining({ status: 'active' }),
    }));
  });

  it('records an update without announcing a new subscription', async () => {
    await handleSubscriptionUpserted(subscription, false);

    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ sourceEvent: 'updated' }),
    }));
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('records deletion only after syncing a currently canceled subscription', async () => {
    mocks.syncSubscription.mockResolvedValue({
      subscription: { ...subscription, status: 'canceled' },
      tenantId: 'tenant-a',
      status: 'canceled',
    });

    await handleSubscriptionDeleted(subscription);

    expect(mocks.syncSubscription).toHaveBeenCalledExactlyOnceWith(subscription.id);
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({
      event: 'subscription_canceled',
    }));
    expect(mocks.sendJob).not.toHaveBeenCalled();
  });

  it('does not announce cancellation when Stripe currently reports a live subscription', async () => {
    await expect(handleSubscriptionDeleted(subscription))
      .rejects.toThrow('Deleted subscription event does not match current Stripe state');
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it.each([
    ['created', () => handleSubscriptionUpserted(subscription, true)],
    ['updated', () => handleSubscriptionUpserted(subscription, false)],
    ['deleted', () => handleSubscriptionDeleted(subscription)],
    ['trial ending', () => handleTrialWillEnd(subscription)],
  ])('propagates a retryable sync failure before %s effects', async (_event, invoke) => {
    mocks.syncSubscription.mockRejectedValue(new RetryablePreEffectWebhookError(
      'tenant_id_missing', 'tenant not resolved',
    ));

    await expect(invoke()).rejects.toMatchObject({
      name: 'RetryablePreEffectWebhookError', code: 'tenant_id_missing',
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.sendJob).not.toHaveBeenCalled();
  });

  it('audits a trial-ending signal using the current Stripe trial date', async () => {
    const liveTrial = {
      ...subscription,
      status: 'trialing',
      trial_end: 1780003600,
    } as Stripe.Subscription;
    mocks.syncSubscription.mockResolvedValue({
      subscription: liveTrial,
      tenantId: 'tenant-a',
      status: 'trialing',
    });

    await handleTrialWillEnd(subscription);

    expect(mocks.syncSubscription).toHaveBeenCalledExactlyOnceWith(subscription.id);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'billing.trial.will_end',
      tenantId: 'tenant-a',
      entityId: subscription.id,
      metadata: { trialEnd: new Date(1780003600 * 1000).toISOString() },
    }));
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('ignores a delayed trial-ending signal after the current subscription was canceled', async () => {
    mocks.syncSubscription.mockResolvedValue({
      subscription: { ...subscription, status: 'canceled', trial_end: 1780003600 },
      tenantId: 'tenant-a',
      status: 'canceled',
    });

    await handleTrialWillEnd(subscription);

    expect(mocks.syncSubscription).toHaveBeenCalledExactlyOnceWith(subscription.id);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.sendJob).not.toHaveBeenCalled();
  });

  it.each(['inngest', 'pgboss'] as const)(
    'finishes canceled and trial-ending webhook handlers without phantom queue events on %s',
    async (backend) => {
      vi.stubEnv('JOBS_BACKEND', backend);
      mocks.sendJob.mockRejectedValue(new Error('enqueue must not happen'));

      mocks.syncSubscription
        .mockResolvedValueOnce({
          subscription: { ...subscription, status: 'canceled' },
          tenantId: 'tenant-a',
          status: 'canceled',
        })
        .mockResolvedValueOnce({
          subscription: { ...subscription, status: 'trialing', trial_end: 1780003600 },
          tenantId: 'tenant-a',
          status: 'trialing',
        });
      await expect(handleSubscriptionDeleted(subscription)).resolves.toBeUndefined();
      await expect(handleTrialWillEnd(subscription)).resolves.toBeUndefined();

      expect(mocks.audit).toHaveBeenCalledTimes(2);
      expect(mocks.track).toHaveBeenCalledOnce();
      expect(mocks.sendJob).not.toHaveBeenCalled();
    },
  );

});
