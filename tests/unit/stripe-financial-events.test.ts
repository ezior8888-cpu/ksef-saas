import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  retrieveRefund: vi.fn(),
  retrieveDispute: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({
    refunds: { retrieve: mocks.retrieveRefund },
    disputes: { retrieve: mocks.retrieveDispute },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

import { handleFinancialStripeEvent } from '@/lib/stripe/financial-events';
import { RetryablePreEffectWebhookError } from '@/lib/stripe/webhook-errors';

const refundId = 're_1234567890';
const disputeId = 'du_1234567890';
const chargeId = 'ch_1234567890';
const paymentIntentId = 'pi_1234567890';

function event(type: string, id: string, objectExtras: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: 'evt_1234567890', type,
    data: { object: { id, ...objectExtras } },
  } as unknown as Stripe.Event;
}

function refund(id = refundId, extras: Record<string, unknown> = {}): Stripe.Refund {
  return {
    id, object: 'refund', amount: 1200, currency: 'pln', status: 'succeeded',
    payment_intent: paymentIntentId, charge: chargeId,
    metadata: { tenantId: 'untrusted-tenant' }, ...extras,
  } as unknown as Stripe.Refund;
}

function dispute(id = disputeId, extras: Record<string, unknown> = {}): Stripe.Dispute {
  return {
    id, object: 'dispute', amount: 1200, currency: 'pln', status: 'needs_response',
    payment_intent: paymentIntentId, charge: chargeId,
    metadata: { tenantId: 'untrusted-tenant' }, ...extras,
  } as unknown as Stripe.Dispute;
}

function writtenCase(): Record<string, unknown> {
  return mocks.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.retrieveRefund.mockResolvedValue(refund());
  mocks.retrieveDispute.mockResolvedValue(dispute());
  mocks.rpc.mockResolvedValue({ data: 'linked', error: null });
});

describe('Stripe financial event reconciliation', () => {
  it('records the fresh refund state rather than a stale webhook snapshot', async () => {
    await handleFinancialStripeEvent(event('refund.created', refundId, {
      amount: 1, currency: 'usd', status: 'pending',
      metadata: { tenantId: 'forged' },
    }));

    expect(mocks.retrieveRefund).toHaveBeenCalledExactlyOnceWith(refundId);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('record_stripe_financial_case', {
      p_kind: 'refund',
      p_stripe_object_id: refundId,
      p_event_id: 'evt_1234567890',
      p_payment_intent_id: paymentIntentId,
      p_charge_id: chargeId,
      p_reference_invalid: false,
      p_amount_cents: 1200,
      p_currency: 'pln',
      p_stripe_status: 'succeeded',
    });
    expect(mocks.retrieveDispute).not.toHaveBeenCalled();
  });

  it('allows the database to quarantine an unmatched dispute without treating it as a failure', async () => {
    mocks.retrieveDispute.mockResolvedValue(dispute(disputeId, {
      payment_intent: null,
      charge: null,
      status: 'won',
    }));
    mocks.rpc.mockResolvedValue({ data: 'quarantined', error: null });

    await expect(handleFinancialStripeEvent(event('charge.dispute.closed', disputeId)))
      .resolves.toBeUndefined();
    expect(writtenCase()).toMatchObject({
      p_kind: 'dispute',
      p_payment_intent_id: null,
      p_charge_id: null,
      p_reference_invalid: false,
      p_stripe_status: 'won',
    });
  });

  it('records duplicate deliveries against the same Stripe object identity', async () => {
    const delivery = event('refund.updated', refundId);
    await handleFinancialStripeEvent(delivery);
    await handleFinancialStripeEvent(delivery);

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.retrieveRefund).toHaveBeenCalledTimes(2);
  });

  it('marks malformed references invalid and never infers tenant identity from metadata', async () => {
    mocks.retrieveRefund.mockResolvedValue(refund(refundId, {
      payment_intent: { id: 'pi_not-valid', object: 'payment_intent' },
      charge: 'ch_bad',
    }));
    await handleFinancialStripeEvent(event('refund.failed', refundId));

    expect(writtenCase()).toMatchObject({
      p_payment_intent_id: null,
      p_charge_id: null,
      p_reference_invalid: true,
    });
    expect(writtenCase()).not.toHaveProperty('p_tenant_id');
    expect(JSON.stringify(writtenCase())).not.toContain('untrusted-tenant');
  });

  it('marks an invalid PaymentIntent even when the Charge reference is valid', async () => {
    mocks.retrieveRefund.mockResolvedValue(refund(refundId, {
      payment_intent: 'pi_bad', charge: chargeId,
    }));
    await handleFinancialStripeEvent(event('refund.created', refundId));

    expect(writtenCase()).toMatchObject({
      p_payment_intent_id: null,
      p_charge_id: chargeId,
      p_reference_invalid: true,
    });
  });

  it('marks an invalid Charge even when the PaymentIntent reference is valid', async () => {
    mocks.retrieveRefund.mockResolvedValue(refund(refundId, {
      payment_intent: paymentIntentId, charge: 'ch_bad',
    }));
    await handleFinancialStripeEvent(event('refund.created', refundId));

    expect(writtenCase()).toMatchObject({
      p_payment_intent_id: paymentIntentId,
      p_charge_id: null,
      p_reference_invalid: true,
    });
  });

  it('does not mark an absent reference invalid when the other one is valid', async () => {
    mocks.retrieveRefund.mockResolvedValue(refund(refundId, {
      payment_intent: null, charge: chargeId,
    }));
    await handleFinancialStripeEvent(event('refund.created', refundId));

    expect(writtenCase()).toMatchObject({
      p_payment_intent_id: null,
      p_charge_id: chargeId,
      p_reference_invalid: false,
    });
  });

  it('accepts only an expanded reference with its matching Stripe object type', async () => {
    mocks.retrieveDispute.mockResolvedValue(dispute(disputeId, {
      payment_intent: { id: paymentIntentId, object: 'customer' },
      charge: { id: chargeId, object: 'charge' },
    }));
    await handleFinancialStripeEvent(event('charge.dispute.updated', disputeId));

    expect(writtenCase()).toMatchObject({
      p_payment_intent_id: null,
      p_charge_id: chargeId,
      p_reference_invalid: true,
    });
  });

  it('records a nullable Refund.status as unknown for database quarantine', async () => {
    mocks.retrieveRefund.mockResolvedValue(refund(refundId, { status: null }));
    mocks.rpc.mockResolvedValue({ data: 'quarantined', error: null });

    await expect(handleFinancialStripeEvent(event('refund.created', refundId)))
      .resolves.toBeUndefined();
    expect(writtenCase()).toMatchObject({ p_stripe_status: 'unknown' });
  });

  it('marks an unavailable Stripe object retryable only before local writes', async () => {
    mocks.retrieveRefund.mockRejectedValue(new Error('Stripe network unavailable'));

    await expect(handleFinancialStripeEvent(event('refund.created', refundId)))
      .rejects.toBeInstanceOf(RetryablePreEffectWebhookError);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('keeps an ambiguous database result for manual review, without automatic retry', async () => {
    mocks.rpc.mockRejectedValue(new Error('database response lost'));
    await expect(handleFinancialStripeEvent(event('refund.created', refundId)))
      .rejects.not.toBeInstanceOf(RetryablePreEffectWebhookError);
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it('rejects an unconfirmed RPC response', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(handleFinancialStripeEvent(event('refund.created', refundId)))
      .rejects.toThrow('not confirmed');
  });

  it('rejects malformed event object IDs before Stripe lookup', async () => {
    await expect(handleFinancialStripeEvent(event('refund.created', 'not-a-refund')))
      .rejects.toThrow('no valid object ID');
    expect(mocks.retrieveRefund).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
