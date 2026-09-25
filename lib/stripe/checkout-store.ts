/** Durable per-tenant Stripe Checkout claim. Migration 00081 supplies the RPCs. */
import { createAdminClient } from '@/lib/supabase/admin';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExistingCheckoutClaim = {
  state: 'creating' | 'open' | 'uncertain' | 'held' | 'completed';
  attemptId: string;
  customerId: string;
  priceId: string;
  plan: 'monthly' | 'annual';
  sessionId: string | null;
};

export type CheckoutClaim =
  | { state: 'claimed'; attemptId: string }
  | { state: 'subscription' }
  | ExistingCheckoutClaim;

function parseClaim(value: unknown): CheckoutClaim {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unexpected Checkout claim response');
  }
  const row = value as Record<string, unknown>;
  if (row.state === 'subscription') return { state: 'subscription' };
  if (!UUID_PATTERN.test(String(row.attemptId))) {
    throw new Error('Unexpected Checkout claim attempt ID');
  }
  if (row.state === 'claimed') {
    return { state: 'claimed', attemptId: String(row.attemptId) };
  }
  if (row.state === 'creating' || row.state === 'open' ||
      row.state === 'uncertain' || row.state === 'held' ||
      row.state === 'completed') {
    if (typeof row.customerId !== 'string' ||
        typeof row.priceId !== 'string' ||
        (row.plan !== 'monthly' && row.plan !== 'annual') ||
        (row.sessionId !== null && typeof row.sessionId !== 'string') ||
        ((row.state === 'open' || row.state === 'completed') &&
          typeof row.sessionId !== 'string')) {
      throw new Error('Unexpected Checkout claim state');
    }
    return {
      state: row.state,
      attemptId: String(row.attemptId),
      customerId: row.customerId,
      priceId: row.priceId,
      plan: row.plan,
      sessionId: row.sessionId,
    };
  }
  throw new Error('Unexpected Checkout claim response');
}

export async function claimCheckoutAttempt(
  tenantId: string,
  customerId: string,
  priceId: string,
  plan: 'monthly' | 'annual',
): Promise<CheckoutClaim> {
  const { data, error } = await createAdminClient().rpc('claim_stripe_checkout_attempt', {
    p_tenant_id: tenantId,
    p_customer_id: customerId,
    p_price_id: priceId,
    p_plan: plan,
  });
  if (error) throw new Error('Checkout claim failed: ' + error.message);
  return parseClaim(data);
}

async function confirmedTransition(
  rpcName: string,
  args: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await createAdminClient().rpc(rpcName, args);
  if (error) throw new Error('Checkout claim transition failed: ' + error.message);
  if (data !== true) throw new Error('Checkout claim transition was not confirmed');
}

export async function recordCheckoutSession(
  attemptId: string,
  sessionId: string,
  expiresAt: number,
): Promise<void> {
  if (!UUID_PATTERN.test(attemptId) || !Number.isSafeInteger(expiresAt) ||
      expiresAt <= 0) {
    throw new Error('Invalid Checkout Session record');
  }
  await confirmedTransition('record_stripe_checkout_session', {
    p_attempt_id: attemptId,
    p_session_id: sessionId,
    p_expires_at: new Date(expiresAt * 1000).toISOString(),
  });
}

export async function holdCheckoutAttempt(
  attemptId: string,
  expectedStatus: 'creating' | 'open',
  newStatus: 'uncertain' | 'held',
): Promise<void> {
  await confirmedTransition('hold_stripe_checkout_attempt', {
    p_attempt_id: attemptId,
    p_expected_status: expectedStatus,
    p_new_status: newStatus,
  });
}

export async function abandonCheckoutAttempt(attemptId: string): Promise<void> {
  await confirmedTransition('abandon_stripe_checkout_attempt', {
    p_attempt_id: attemptId,
  });
}

export async function settleCheckoutSession(
  attemptId: string,
  sessionId: string,
  status: 'completed' | 'expired',
): Promise<void> {
  await confirmedTransition('settle_stripe_checkout_session', {
    p_attempt_id: attemptId,
    p_session_id: sessionId,
    p_new_status: status,
  });
}

export async function retireCompletedCheckoutAttempt(
  attemptId: string,
  sessionId: string,
  subscriptionId: string,
): Promise<void> {
  await confirmedTransition('retire_completed_stripe_checkout_attempt', {
    p_attempt_id: attemptId,
    p_session_id: sessionId,
    p_subscription_id: subscriptionId,
  });
}
