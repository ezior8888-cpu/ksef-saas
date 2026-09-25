/**
 * Stripe subscription mirror: each signed webhook is a signal to fetch the
 * current resource. A per-subscription DB lease serializes fetch -> apply;
 * fencing makes a late response from an expired lease unable to overwrite a
 * newer snapshot. Migration 00078 owns the three RPCs.
 */
import type Stripe from 'stripe';

import * as Sentry from '@sentry/nextjs';

import { createAdminClient } from '@/lib/supabase/admin';

import { getStripe } from './client';
import { mapSubscriptionToRow, resolveTenantIdFromSubscription } from './event-mapping';
import { RetryablePreEffectWebhookError } from './webhook-errors';

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SyncClaim {
  claimed: boolean;
  claim_token: string | null;
  fence: number | null;
}

export interface SyncedSubscription {
  subscription: Stripe.Subscription;
  tenantId: string;
  status: string;
}

function parseClaim(value: unknown): SyncClaim {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Unexpected subscription sync claim response');
  }
  const result = item as Record<string, unknown>;
  if (result.claimed === false && result.claim_token === null) {
    return { claimed: false, claim_token: null, fence: null };
  }
  if (result.claimed === true &&
      typeof result.claim_token === 'string' &&
      TOKEN_PATTERN.test(result.claim_token) &&
      typeof result.fence === 'number' &&
      Number.isSafeInteger(result.fence) &&
      result.fence > 0) {
    return {
      claimed: true,
      claim_token: result.claim_token,
      fence: result.fence,
    };
  }
  throw new Error('Unexpected subscription sync claim response');
}

/**
 * The lease write is only coordination, not a business side effect. Failures
 * before apply may safely be retried by a later Stripe delivery. Once apply
 * has been attempted, a lost DB response is uncertain and requires review.
 */
export async function syncCurrentStripeSubscription(
  subscriptionId: string,
): Promise<SyncedSubscription> {
  if (!subscriptionId || !subscriptionId.startsWith('sub_')) {
    throw new RetryablePreEffectWebhookError(
      'subscription_sync_invalid',
      'Stripe subscription event has no valid subscription ID',
    );
  }

  const supabase = createAdminClient();
  const claimResponse = await supabase.rpc('claim_stripe_subscription_sync', {
    p_subscription_id: subscriptionId,
  });
  if (claimResponse.error) {
    throw new RetryablePreEffectWebhookError(
      'subscription_sync_claim_failed',
      'Subscription sync claim failed: ' + claimResponse.error.message,
    );
  }
  const claim = parseClaim(claimResponse.data);
  if (!claim.claimed || !claim.claim_token || claim.fence === null) {
    throw new RetryablePreEffectWebhookError(
      'subscription_sync_busy',
      'Another delivery is synchronizing this subscription',
    );
  }

  let applyAttempted = false;
  try {
    let current: Stripe.Subscription;
    try {
      current = await getStripe().subscriptions.retrieve(subscriptionId);
    } catch (error) {
      throw new RetryablePreEffectWebhookError(
        'subscription_sync_lookup_failed',
        'Current Stripe subscription could not be retrieved: ' +
          (error instanceof Error ? error.message : 'unknown error'),
      );
    }
    if (current.id !== subscriptionId) {
      throw new RetryablePreEffectWebhookError(
        'subscription_sync_invalid',
        'Stripe returned a different subscription ID',
      );
    }

    const tenantId = await resolveTenantIdFromSubscription(current);
    let snapshot: Record<string, unknown>;
    try {
      snapshot = mapSubscriptionToRow(current, tenantId);
    } catch (error) {
      throw new RetryablePreEffectWebhookError(
        'subscription_sync_invalid',
        'Current subscription snapshot is invalid: ' +
          (error instanceof Error ? error.message : 'unknown error'),
      );
    }
    if (snapshot.stripe_subscription_id !== subscriptionId ||
        snapshot.tenant_id !== tenantId) {
      throw new RetryablePreEffectWebhookError(
        'subscription_sync_invalid',
        'Current subscription snapshot identity mismatch',
      );
    }

    applyAttempted = true;
    const applied = await supabase.rpc('apply_stripe_subscription_sync', {
      p_subscription_id: subscriptionId,
      p_claim_token: claim.claim_token,
      p_fence: claim.fence,
      p_snapshot: snapshot,
    });
    if (applied.error) {
      throw new Error('Subscription sync apply failed: ' + applied.error.message);
    }
    if (applied.data !== true) {
      throw new Error('Subscription sync apply was not confirmed');
    }

    return { subscription: current, tenantId, status: String(snapshot.status) };
  } catch (error) {
    if (!applyAttempted) {
      // A failed release only delays retry until lease expiry. It has no
      // business effect; keep the original pre-effect error classification.
      try {
        const released = await supabase.rpc('release_stripe_subscription_sync', {
          p_subscription_id: subscriptionId,
          p_claim_token: claim.claim_token,
          p_fence: claim.fence,
        });
        if (released.error || released.data !== true) {
          throw new Error('Subscription sync lease release was not confirmed');
        }
      } catch (releaseError) {
        Sentry.captureException(releaseError, {
          tags: { area: 'stripe.subscription_sync.release' },
          extra: { subscriptionId },
        });
      }
    }
    throw error;
  }
}