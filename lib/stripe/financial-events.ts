/**
 * Signed Stripe financial events are reconciled against fresh Stripe objects.
 * This module only records review cases. It never changes a payment, VAT invoice,
 * Stripe refund, or dispute directly.
 */
import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from './client';
import { RetryablePreEffectWebhookError } from './webhook-errors';

const ID_SUFFIX = '[A-Za-z0-9]{8,}';
const REFUND_ID = new RegExp('^re_' + ID_SUFFIX + '$');
const DISPUTE_ID = new RegExp('^du_' + ID_SUFFIX + '$');
const CHARGE_ID = new RegExp('^ch_' + ID_SUFFIX + '$');
const PAYMENT_INTENT_ID = new RegExp('^pi_' + ID_SUFFIX + '$');

type FinancialKind = 'refund' | 'dispute';
type FinancialObject = Stripe.Refund | Stripe.Dispute;

type FinancialCase = {
  kind: FinancialKind;
  stripeObjectId: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  referenceInvalid: boolean;
  amountCents: number;
  currency: string;
  stripeStatus: string;
};

type ParsedReference = { id: string | null; invalid: boolean };

function eventObjectId(event: Stripe.Event, pattern: RegExp): string {
  const value: unknown = event.data.object;
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      !('id' in value) || typeof value.id !== 'string' ||
      !pattern.test(value.id)) {
    throw new Error('Stripe financial event has no valid object ID');
  }
  return value.id;
}

/** Reject malformed values even when the other full reference happens to match. */
function strictReference(value: unknown, pattern: RegExp, objectType: string): ParsedReference {
  if (value === null || value === undefined) return { id: null, invalid: false };
  if (typeof value === 'string') {
    return pattern.test(value)
      ? { id: value, invalid: false } : { id: null, invalid: true };
  }
  if (typeof value === 'object' && !Array.isArray(value) &&
      'object' in value && value.object === objectType &&
      'id' in value && typeof value.id === 'string' && pattern.test(value.id)) {
    return { id: value.id, invalid: false };
  }
  return { id: null, invalid: true };
}

function caseFromObject(kind: FinancialKind, value: FinancialObject): FinancialCase {
  const pattern = kind === 'refund' ? REFUND_ID : DISPUTE_ID;
  if (value.object !== kind || !pattern.test(value.id)) {
    throw new Error('Stripe returned an unexpected financial object');
  }
  // Stripe Refund.status is nullable. Keep the observation durable as an
  // unknown status; the database quarantines it instead of dropping the event.
  const stripeStatus: unknown = kind === 'refund' && value.status === null
    ? 'unknown' : value.status;
  if (!Number.isSafeInteger(value.amount) || value.amount <= 0 ||
      typeof value.currency !== 'string' || !/^[a-z]{3}$/.test(value.currency) ||
      typeof stripeStatus !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(stripeStatus)) {
    throw new Error('Stripe financial object has invalid amount, currency, or status');
  }
  const paymentIntent = strictReference(
    value.payment_intent, PAYMENT_INTENT_ID, 'payment_intent',
  );
  const charge = strictReference(value.charge, CHARGE_ID, 'charge');
  return {
    kind,
    stripeObjectId: value.id,
    paymentIntentId: paymentIntent.id,
    chargeId: charge.id,
    referenceInvalid: paymentIntent.invalid || charge.invalid,
    amountCents: value.amount,
    currency: value.currency,
    stripeStatus,
  };
}

async function recordFinancialCase(eventId: string, financialCase: FinancialCase): Promise<void> {
  const { data, error } = await createAdminClient().rpc('record_stripe_financial_case', {
    p_kind: financialCase.kind,
    p_stripe_object_id: financialCase.stripeObjectId,
    p_event_id: eventId,
    p_payment_intent_id: financialCase.paymentIntentId,
    p_charge_id: financialCase.chargeId,
    p_reference_invalid: financialCase.referenceInvalid,
    p_amount_cents: financialCase.amountCents,
    p_currency: financialCase.currency,
    p_stripe_status: financialCase.stripeStatus,
  });
  // A lost DB response may follow a committed write. Never classify it as
  // pre-effect retryable; the operator can reconcile the failed receipt.
  if (error || (data !== 'linked' && data !== 'quarantined')) {
    throw new Error('Stripe financial case write was not confirmed');
  }
}

async function retrieveRefund(refundId: string): Promise<Stripe.Refund> {
  try {
    return await getStripe().refunds.retrieve(refundId);
  } catch {
    throw new RetryablePreEffectWebhookError(
      'financial_object_lookup_failed', 'Stripe refund lookup failed before local writes',
    );
  }
}

async function retrieveDispute(disputeId: string): Promise<Stripe.Dispute> {
  try {
    return await getStripe().disputes.retrieve(disputeId);
  } catch {
    throw new RetryablePreEffectWebhookError(
      'financial_object_lookup_failed', 'Stripe dispute lookup failed before local writes',
    );
  }
}

/**
 * The route verifies the signature and owns receipt claim/finalization. One
 * successfully recorded review case is durable even if the payment is not yet
 * linked; the database RPC decides whether to link or quarantine it.
 */
export async function handleFinancialStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed':
    case 'charge.refund.updated': {
      const refundId = eventObjectId(event, REFUND_ID);
      const refund = await retrieveRefund(refundId);
      if (refund.id !== refundId) throw new Error('Stripe refund ID changed during lookup');
      await recordFinancialCase(event.id, caseFromObject('refund', refund));
      return;
    }
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
    case 'charge.dispute.funds_withdrawn':
    case 'charge.dispute.funds_reinstated': {
      const disputeId = eventObjectId(event, DISPUTE_ID);
      const dispute = await retrieveDispute(disputeId);
      if (dispute.id !== disputeId) throw new Error('Stripe dispute ID changed during lookup');
      await recordFinancialCase(event.id, caseFromObject('dispute', dispute));
      return;
    }
    default:
      throw new Error('Unsupported Stripe financial event type');
  }
}
