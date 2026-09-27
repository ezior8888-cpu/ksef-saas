import * as Sentry from '@sentry/nextjs';
import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/supabase/admin';

import { getStripe } from './client';
import { RetryablePreEffectWebhookError } from './webhook-errors';
import {
  recordCheckoutSession,
  recordVerifiedUncertainCheckoutSession,
  settleCheckoutSession,
} from './checkout-store';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;
const STRIPE_READ_OPTIONS = { timeout: 5_000, maxNetworkRetries: 0 } as const;

type StoredCheckoutAttempt = {
  id: string;
  tenant_id: string;
  stripe_customer_id: string;
  plan: string;
  status: string;
  stripe_session_id: string | null;
};

/** Only an exact, current Stripe Session may close a durable open claim. */
export type OpenCheckoutAttempt = {
  id: string;
  tenant_id: string;
  stripe_customer_id: string;
  plan: 'monthly' | 'annual';
  stripe_session_id: string;
};

function customerId(value: Stripe.Checkout.Session['customer']): string | null {
  return typeof value === 'string' ? value : value?.id ?? null;
}

function toOpenAttempt(
  row: StoredCheckoutAttempt,
  sessionId: string,
): OpenCheckoutAttempt {
  if (row.plan !== 'monthly' && row.plan !== 'annual') {
    throw new Error('Invalid stored Checkout plan');
  }
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    stripe_customer_id: row.stripe_customer_id,
    plan: row.plan,
    stripe_session_id: sessionId,
  };
}

export function matchesOpenCheckoutAttempt(
  session: Stripe.Checkout.Session,
  attempt: OpenCheckoutAttempt,
): boolean {
  return session.id === attempt.stripe_session_id &&
    customerId(session.customer) === attempt.stripe_customer_id &&
    session.mode === 'subscription' &&
    session.client_reference_id === attempt.id &&
    session.metadata?.attemptId === attempt.id &&
    session.metadata?.tenantId === attempt.tenant_id &&
    session.metadata?.plan === attempt.plan;
}

async function settleVerifiedSession(
  session: Stripe.Checkout.Session,
  attempt: OpenCheckoutAttempt,
): Promise<'open' | 'completed' | 'expired'> {
  if (!matchesOpenCheckoutAttempt(session, attempt)) {
    throw new Error('Stripe Checkout Session identity mismatch during reconciliation');
  }
  if (session.status === 'open') return 'open';
  if (session.status === 'complete') {
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription : session.subscription?.id;
    if (!subscriptionId?.startsWith('sub_')) {
      throw new Error('Completed Stripe Checkout Session has no Subscription ID');
    }
    await settleCheckoutSession(attempt.id, session.id, 'completed');
    return 'completed';
  }
  if (session.status === 'expired') {
    await settleCheckoutSession(attempt.id, session.id, 'expired');
    return 'expired';
  }
  throw new Error('Unexpected Stripe Checkout Session status');
}

export async function reconcileOpenCheckoutAttempt(
  attempt: OpenCheckoutAttempt,
): Promise<'open' | 'completed' | 'expired'> {
  const session = await getStripe().checkout.sessions.retrieve(attempt.stripe_session_id, {}, STRIPE_READ_OPTIONS);
  return settleVerifiedSession(session, attempt);
}

async function readCheckoutAttempt(
  attemptId: string,
  preEffect = false,
): Promise<StoredCheckoutAttempt> {
  let result: { data: StoredCheckoutAttempt | null; error: { message: string } | null };
  try {
    result = await createAdminClient()
      .from('stripe_checkout_attempts')
      .select('id, tenant_id, stripe_customer_id, plan, status, stripe_session_id')
      .eq('id', attemptId)
      .maybeSingle();
  } catch {
    if (preEffect) {
      throw new RetryablePreEffectWebhookError(
        'checkout_attempt_lookup_failed', 'Checkout attempt lookup failed before local writes',
      );
    }
    throw new Error('Checkout attempt lookup failed after an uncertain write');
  }
  if (result.error) {
    if (preEffect) {
      throw new RetryablePreEffectWebhookError(
        'checkout_attempt_lookup_failed', 'Checkout attempt lookup failed before local writes',
      );
    }
    throw new Error('Checkout attempt lookup failed: ' + result.error.message);
  }
  if (!result.data) throw new Error('Stripe Checkout Session has no matching attempt');
  return result.data;
}

/** A signed event wakes us up; the fresh provider object is still authority. */
export async function handleCheckoutSessionStateEvent(
  snapshot: Stripe.Checkout.Session,
): Promise<void> {
  if (!SESSION_ID_PATTERN.test(snapshot.id)) {
    throw new Error('Invalid Stripe Checkout Session ID');
  }
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(snapshot.id, {}, STRIPE_READ_OPTIONS);
  } catch {
    throw new RetryablePreEffectWebhookError(
      'checkout_session_lookup_failed', 'Stripe Checkout Session lookup failed before local writes',
    );
  }
  if (session.id !== snapshot.id) {
    throw new Error('Stripe Checkout Session retrieval ID mismatch');
  }
  const attemptId = session.client_reference_id;
  if (!attemptId || !UUID_PATTERN.test(attemptId)) {
    throw new Error('Stripe Checkout Session has no valid attempt reference');
  }
  let row = await readCheckoutAttempt(attemptId, true);
  const attempt = toOpenAttempt(row, session.id);
  if (!matchesOpenCheckoutAttempt(session, attempt)) {
    throw new Error('Stripe Checkout Session identity mismatch during reconciliation');
  }

  // The event may beat the application's record RPC or confirm a create whose
  // DB response was lost. A verified provider Session can finish that write.
  if (row.status === 'creating' || row.status === 'uncertain') {
    if (row.stripe_session_id !== null ||
        !Number.isSafeInteger(session.expires_at) ||
        session.expires_at <= 0) {
      throw new Error('Unverifiable unresolved Checkout attempt');
    }
    try {
      if (row.status === 'creating') {
        await recordCheckoutSession(attemptId, session.id, session.expires_at);
      } else {
        // Never release an uncertain claim from time or a guessed Session.
        // This path is reached only after signature verification and fresh
        // provider identity checks above.
        await recordVerifiedUncertainCheckoutSession(
          attemptId, attempt.tenant_id, attempt.stripe_customer_id,
          attempt.plan, session.id, session.expires_at,
        );
      }
      row = { ...row, status: 'open', stripe_session_id: session.id };
    } catch (error) {
      // A lost response can mean another writer committed. Reread; never
      // convert an ambiguous write into another Stripe Session.
      row = await readCheckoutAttempt(attemptId);
      if (row.stripe_session_id !== session.id ||
          !['open', 'completed', 'expired'].includes(row.status)) {
        throw error;
      }
    }
  }

  if (row.status === 'open') {
    if (row.stripe_session_id !== session.id) {
      throw new Error('Checkout attempt Session ID mismatch');
    }
    await settleVerifiedSession(session, attempt);
    return;
  }
  if (row.status === 'completed' || row.status === 'expired' ||
      row.status === 'retired') {
    if (row.stripe_session_id !== session.id) {
      throw new Error('Terminal Checkout attempt Session ID mismatch');
    }
    if ((row.status === 'completed' && session.status === 'complete') ||
        (row.status === 'expired' && session.status === 'expired') ||
        (row.status === 'retired' && session.status === 'complete')) {
      return;
    }
  }
  throw new Error('Checkout attempt requires manual reconciliation');
}

/**
 * The monitor verifies old open claims with Stripe before deciding that they
 * need operator attention. A provider or identity error leaves the claim
 * blocking and visible to the alert; time alone never releases it.
 */
export async function reconcileExpiredOpenCheckoutAttempts(
  cutoffIso: string,
): Promise<void> {
  const { data, error } = await createAdminClient()
    .from('stripe_checkout_attempts')
    .select('id, tenant_id, stripe_customer_id, plan, stripe_session_id')
    .eq('status', 'open')
    .lt('session_expires_at', cutoffIso)
    .order('session_expires_at', { ascending: true })
    .limit(50);
  if (error) throw new Error('Expired Checkout attempts lookup failed: ' + error.message);
  const rows = data ?? [];
  for (let start = 0; start < rows.length; start += 5) {
    await Promise.all(rows.slice(start, start + 5).map(async (row) => {
      if ((row.plan !== 'monthly' && row.plan !== 'annual') ||
          !row.stripe_session_id) {
        Sentry.captureMessage('Invalid stored open Checkout attempt', {
          level: 'error',
          extra: { attemptId: row.id },
        });
        return;
      }
      try {
        await reconcileOpenCheckoutAttempt({
          id: row.id,
          tenant_id: row.tenant_id,
          stripe_customer_id: row.stripe_customer_id,
          plan: row.plan,
          stripe_session_id: row.stripe_session_id,
        });
      } catch (error) {
        Sentry.captureException(error, {
          tags: { area: 'billing.checkout.reconcile' },
          extra: { attemptId: row.id },
        });
      }
    }));
  }
}
