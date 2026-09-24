import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  subscriptionRead: vi.fn(),
  stripeRetrieve: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ customers: { retrieve: mocks.stripeRetrieve } }),
}));

import {
  mapInvoiceToPaymentRow,
  resolveTenantIdFromSubscription,
} from '@/lib/stripe/event-mapping';
import { RetryablePreEffectWebhookError } from '@/lib/stripe/webhook-errors';

function invoice(subscription: string | null): Stripe.Invoice {
  return {
    id: 'in_ordered',
    subscription,
    amount_paid: 12000,
    amount_due: 12000,
    currency: 'pln',
    status_transitions: { paid_at: 1780000000 },
  } as unknown as Stripe.Invoice;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: mocks.subscriptionRead }),
    }),
  });
});

describe('Stripe invoice subscription ordering', () => {
  it('skips an actual one-time invoice without a subscription reference', async () => {
    await expect(mapInvoiceToPaymentRow(invoice(null), 'succeeded')).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('retries a referenced invoice when its subscription row has not arrived', async () => {
    mocks.subscriptionRead.mockResolvedValue({ data: null, error: null });

    await expect(mapInvoiceToPaymentRow(invoice('sub_later'), 'succeeded'))
      .rejects.toThrow('subscription sub_later not found');
    expect(mocks.from).toHaveBeenCalledWith('subscriptions');
  });

  it('retries a subscription lookup failure', async () => {
    mocks.subscriptionRead.mockResolvedValue({
      data: null,
      error: { message: 'temporary database outage' },
    });

    await expect(mapInvoiceToPaymentRow(invoice('sub_later'), 'failed'))
      .rejects.toThrow('subscription lookup failed: temporary database outage');
  });

  it('reads a Basil+ subscription reference from invoice.parent', async () => {
    mocks.subscriptionRead.mockResolvedValue({
      data: { id: 'local-subscription', tenant_id: 'tenant-a' },
      error: null,
    });
    const modern = {
      ...invoice(null),
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: 'sub_modern' },
      },
    } as unknown as Stripe.Invoice;

    await expect(mapInvoiceToPaymentRow(modern, 'succeeded'))
      .resolves.toMatchObject({ row: { subscription_id: 'local-subscription' } });
    expect(mocks.from).toHaveBeenCalledWith('subscriptions');
  });

  it('does not mistake a malformed subscription parent for a one-time invoice', async () => {
    const malformed = {
      ...invoice(null),
      parent: { type: 'subscription_details', subscription_details: null },
    } as unknown as Stripe.Invoice;

    await expect(mapInvoiceToPaymentRow(malformed, 'succeeded'))
      .rejects.toThrow('subscription parent has no reference');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('maps a referenced invoice only after the subscription is present', async () => {
    mocks.subscriptionRead.mockResolvedValue({
      data: { id: 'local-subscription', tenant_id: 'tenant-a' },
      error: null,
    });

    await expect(mapInvoiceToPaymentRow(invoice('sub_ready'), 'succeeded'))
      .resolves.toMatchObject({
        tenantId: 'tenant-a',
        row: {
          subscription_id: 'local-subscription',
          stripe_invoice_id: 'in_ordered',
          status: 'succeeded',
        },
      });
  });
  it('uses tenant metadata without a Stripe customer lookup', async () => {
    const source = { id: 'sub_direct', metadata: { tenantId: 'tenant-a' } } as unknown as Stripe.Subscription;

    await expect(resolveTenantIdFromSubscription(source)).resolves.toBe('tenant-a');
    expect(mocks.stripeRetrieve).not.toHaveBeenCalled();
  });

  it('marks a transient Stripe customer lookup as safe to retry before effects', async () => {
    const source = {
      id: 'sub_lookup', metadata: {}, customer: 'cus_lookup',
    } as unknown as Stripe.Subscription;
    mocks.stripeRetrieve.mockRejectedValue(new Error('temporary Stripe outage'));

    await expect(resolveTenantIdFromSubscription(source)).rejects.toMatchObject({
      name: 'RetryablePreEffectWebhookError',
      code: 'tenant_lookup_failed',
    } satisfies Partial<RetryablePreEffectWebhookError>);
  });

  it('does not silently process a subscription without any tenant metadata', async () => {
    const source = {
      id: 'sub_missing', metadata: {}, customer: 'cus_missing',
    } as unknown as Stripe.Subscription;
    mocks.stripeRetrieve.mockResolvedValue({ deleted: false, metadata: {} });

    await expect(resolveTenantIdFromSubscription(source)).rejects.toMatchObject({
      code: 'tenant_id_missing',
    } satisfies Partial<RetryablePreEffectWebhookError>);
  });

});
