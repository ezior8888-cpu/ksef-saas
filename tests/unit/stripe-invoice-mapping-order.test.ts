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
import { ReconciliationRequiredWebhookError, RetryablePreEffectWebhookError } from '@/lib/stripe/webhook-errors';

function invoice(subscription: string | null): Stripe.Invoice {
  return {
    id: 'in_ordered',
    subscription,
    payment_intent: 'pi_ValidReference123',
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
          stripe_payment_intent_id: 'pi_ValidReference123',
          stripe_charge_id: null,
          status: 'succeeded',
        },
      });
  });
  it('accepts a signed paid invoice with only a valid charge reference', async () => {
    mocks.subscriptionRead.mockResolvedValue({
      data: { id: 'local-subscription', tenant_id: 'tenant-a' },
      error: null,
    });
    const withCharge = {
      ...invoice('sub_ready'),
      payment_intent: null,
      charge: 'ch_ValidReference123',
    } as unknown as Stripe.Invoice;

    await expect(mapInvoiceToPaymentRow(withCharge, 'succeeded'))
      .resolves.toMatchObject({
        row: {
          stripe_payment_intent_id: null,
          stripe_charge_id: 'ch_ValidReference123',
        },
      });
  });

  it('preserves both valid legacy references when both are present', async () => {
    mocks.subscriptionRead.mockResolvedValue({
      data: { id: 'local-subscription', tenant_id: 'tenant-a' },
      error: null,
    });
    const withBoth = {
      ...invoice('sub_ready'),
      charge: 'ch_ValidReference123',
    } as unknown as Stripe.Invoice;

    await expect(mapInvoiceToPaymentRow(withBoth, 'succeeded'))
      .resolves.toMatchObject({
        row: {
          stripe_payment_intent_id: 'pi_ValidReference123',
          stripe_charge_id: 'ch_ValidReference123',
        },
      });
  });

  it.each([
    ['missing both', { payment_intent: null, charge: null }],
    ['empty PI', { payment_intent: '' }],
    ['wrong PI prefix', { payment_intent: 'ch_WrongReference123' }],
    ['short PI', { payment_intent: 'pi_x' }],
    ['expanded PI object', { payment_intent: { id: 'pi_ValidReference123' } }],
    ['empty charge', { payment_intent: null, charge: '' }],
    ['wrong charge prefix', { payment_intent: null, charge: 'pi_WrongReference123' }],
    ['short charge', { payment_intent: null, charge: 'ch_x' }],
    ['invalid second reference', { charge: 'pi_WrongReference123' }],
  ])('rejects a paid subscription invoice with %s before DB access', async (_label, refs) => {
    const invalid = { ...invoice('sub_ready'), ...refs } as unknown as Stripe.Invoice;

    await expect(mapInvoiceToPaymentRow(invalid, 'succeeded'))
      .rejects.toMatchObject({
        name: 'ReconciliationRequiredWebhookError',
        code: 'payment_reference_missing_or_invalid',
      } satisfies Partial<ReconciliationRequiredWebhookError>);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([
    ['missing', undefined],
    ['null', null],
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['not finite', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
    ['outside the Date range', 8_640_000_000_001],
  ])('rejects a paid subscription invoice with %s paid_at before DB access', async (_label, paidAt) => {
    const invalid = {
      ...invoice('sub_ready'),
      status_transitions: { paid_at: paidAt },
    } as unknown as Stripe.Invoice;

    await expect(mapInvoiceToPaymentRow(invalid, 'succeeded'))
      .rejects.toThrow('has no valid paid_at');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('persists the signed paid_at rather than the webhook receipt time', async () => {
    mocks.subscriptionRead.mockResolvedValue({
      data: { id: 'local-subscription', tenant_id: 'tenant-a' },
      error: null,
    });

    await expect(mapInvoiceToPaymentRow(invoice('sub_ready'), 'succeeded'))
      .resolves.toMatchObject({
        row: { paid_at: new Date(1780000000 * 1000).toISOString() },
      });
  });

  it('does not require paid_at on an unsuccessful invoice', async () => {
    mocks.subscriptionRead.mockResolvedValue({
      data: { id: 'local-subscription', tenant_id: 'tenant-a' },
      error: null,
    });
    const failed = {
      ...invoice('sub_ready'),
      payment_intent: null,
      status_transitions: { paid_at: null },
    } as unknown as Stripe.Invoice;

    await expect(mapInvoiceToPaymentRow(failed, 'failed'))
      .resolves.toMatchObject({ row: { paid_at: null } });
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
