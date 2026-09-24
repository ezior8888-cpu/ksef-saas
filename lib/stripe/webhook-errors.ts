/**
 * Only for failures proven to happen before any local write or downstream
 * event. The webhook receipt may safely be reclaimed after Stripe retries.
 */
export type RetryablePreEffectWebhookCode =
  | 'subscription_lookup_failed'
  | 'subscription_not_found'
  | 'tenant_lookup_failed'
  | 'tenant_id_missing';

export class RetryablePreEffectWebhookError extends Error {
  readonly code: RetryablePreEffectWebhookCode;

  constructor(code: RetryablePreEffectWebhookCode, message: string) {
    super(message);
    this.name = 'RetryablePreEffectWebhookError';
    this.code = code;
  }
}
