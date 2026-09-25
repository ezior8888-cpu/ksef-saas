/** Atomic Stripe webhook receipt claims. Migration 00076 supplies the RPCs. */

import { createAdminClient } from '@/lib/supabase/admin';

export type WebhookClaim =
  | { state: 'claimed'; token: string }
  | { state: 'processed' }
  | { state: 'busy' };

export type WebhookProcessingStatus = 'processed' | 'failed' | 'retryable';

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

function parseClaim(value: unknown): WebhookClaim {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Unexpected webhook claim response');
  }
  const result = value as Record<string, unknown>;
  if (result.state === 'claimed' && typeof result.token === 'string' &&
      TOKEN_PATTERN.test(result.token)) {
    return { state: 'claimed', token: result.token };
  }
  if (result.state === 'processed' || result.state === 'busy') {
    return { state: result.state };
  }
  throw new Error('Unexpected webhook claim response');
}

/**
 * One database transaction acquires a row lock before deciding if a delivery
 * may run. An in-flight or failed claim is never automatically taken over: the previous
 * handler might have committed a downstream side effect. Only an explicitly
 * marked pre-effect failure can be retried with a fresh owner token.
 */
export async function tryClaimWebhookEvent(
  eventId: string,
  type: string,
  payload: unknown,
): Promise<WebhookClaim> {
  const { data, error } = await createAdminClient().rpc('claim_stripe_webhook_event', {
    p_event_id: eventId,
    p_event_type: type,
    p_payload: payload,
  });
  if (error) {
    throw new Error('webhook claim failed: ' + error.message);
  }
  return parseClaim(data);
}

/**
 * Finalization is conditional on the exact claim owner. A missing row, stale
 * token, or database error must propagate so the endpoint does not send 2xx.
 */
export async function finalizeWebhookEvent(
  eventId: string,
  token: string,
  status: WebhookProcessingStatus,
  errorCode?: string,
): Promise<void> {
  if (!TOKEN_PATTERN.test(token) || (errorCode !== undefined && !ERROR_CODE_PATTERN.test(errorCode))) {
    throw new Error('Invalid webhook finalization arguments');
  }

  const { data, error } = await createAdminClient().rpc('finalize_stripe_webhook_event', {
    p_event_id: eventId,
    p_claim_token: token,
    p_status: status,
    p_error_code: errorCode ?? null,
  });
  if (error) {
    throw new Error('webhook finalization failed: ' + error.message);
  }
  if (data !== true) {
    throw new Error('Webhook finalization was not confirmed');
  }
}
