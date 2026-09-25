/**
 * Mapping Stripe events → row inserts/updates dla `subscriptions` /
 * `stripe_payments` (Faza 25 Krok 3).
 *
 * Wydzielone z `webhook-handlers.ts` żeby pure functions były testowalne
 * bez mockowania DB. Każda funkcja przyjmuje Stripe object i zwraca POJO
 * gotowe do PostgREST `.insert()` / `.update()`.
 *
 * Mapowanie statusów Stripe → naszego enuma:
 *   subscription.status (Stripe): incomplete, incomplete_expired, trialing,
 *     active, past_due, canceled, unpaid, paused
 *   subscription_status_enum: identyczne 1:1.
 */

import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/supabase/admin';

import type { ActiveSubscription } from './subscription';
import { ReconciliationRequiredWebhookError, RetryablePreEffectWebhookError } from './webhook-errors';

type SubscriptionStatus = ActiveSubscription['status'];
type SubscriptionPlan = ActiveSubscription['plan'];

const VALID_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
];

export function mapSubscriptionStatus(raw: string | null | undefined): SubscriptionStatus {
  if (raw && VALID_SUBSCRIPTION_STATUSES.includes(raw as SubscriptionStatus)) {
    return raw as SubscriptionStatus;
  }
  throw new Error('Stripe subscription has an unrecognized status');
}

/**
 * Wyznacza plan na podstawie Price ID. Mapowanie sterowane env vars
 * (`STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL`) — bez tego nie wiemy
 * który Price ID = który plan.
 */
export function getConfiguredStripePriceIds(): { monthly: string; annual: string } {
  const monthly = process.env.STRIPE_PRICE_MONTHLY?.trim();
  const annual = process.env.STRIPE_PRICE_ANNUAL?.trim();
  if (!monthly || !annual) {
    throw new Error('Stripe monthly and annual Price IDs must both be configured');
  }
  if (monthly === annual) {
    throw new Error('Stripe monthly and annual Price IDs must be distinct');
  }
  return { monthly, annual };
}

export function mapPriceIdToPlan(priceId: string | null | undefined): SubscriptionPlan {
  const configured = getConfiguredStripePriceIds();
  if (priceId === configured.monthly) return 'monthly';
  if (priceId === configured.annual) return 'annual';
  throw new Error('Stripe subscription has an unrecognized Price ID');
}

function isoFromUnix(unix: number | null | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

function paidAtFromInvoice(invoice: Stripe.Invoice): string {
  const unix = invoice.status_transitions?.paid_at;
  if (typeof unix !== 'number' || !Number.isSafeInteger(unix) || unix <= 0) {
    throw new Error('Stripe paid invoice ' + invoice.id + ' has no valid paid_at');
  }
  const paidAt = new Date(unix * 1000);
  if (!Number.isFinite(paidAt.getTime())) {
    throw new Error('Stripe paid invoice ' + invoice.id + ' has no valid paid_at');
  }
  return paidAt.toISOString();
}

/**
 * Resolve tenant before any local write. An unavailable customer lookup or
 * missing metadata must not turn a subscription event into a processed receipt.
 */
export async function resolveTenantIdFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string> {
  const fromMetadata = subscription.metadata?.tenantId?.trim();
  if (fromMetadata) return fromMetadata;

  const customerRef =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerRef) {
    throw new RetryablePreEffectWebhookError(
      'tenant_id_missing',
      `subscription ${subscription.id} has no customer reference or tenant metadata`,
    );
  }

  try {
    const { getStripe } = await import('./client');
    const customer = await getStripe().customers.retrieve(customerRef);
    if (customer.deleted) {
      throw new RetryablePreEffectWebhookError(
        'tenant_id_missing',
        `subscription ${subscription.id} customer was deleted`,
      );
    }
    const fromCustomer = customer.metadata?.tenantId?.trim();
    if (!fromCustomer) {
      throw new RetryablePreEffectWebhookError(
        'tenant_id_missing',
        `subscription ${subscription.id} customer has no tenant metadata`,
      );
    }
    return fromCustomer;
  } catch (error) {
    if (error instanceof RetryablePreEffectWebhookError) throw error;
    throw new RetryablePreEffectWebhookError(
      'tenant_lookup_failed',
      `subscription ${subscription.id} customer lookup failed`,
    );
  }
}

/**
 * Subscription → row dla `subscriptions` table (INSERT/UPSERT).
 * UUID `id` generowany przez DB; `tenant_id` musi być rozwiązany wcześniej.
 */
export function mapSubscriptionToRow(
  subscription: Stripe.Subscription,
  tenantId: string,
): Record<string, unknown> {
  // Stripe-node v22: typy `current_period_start/end` są na items[*]. Bierzemy
  // z jedynego item'a. Każdy inny układ wymaga osobnego modelu faktury.
  const items = subscription.items;
  if (!items || items.has_more !== false || items.data.length !== 1 ||
      items.data[0]?.quantity !== 1) {
    throw new Error('Stripe subscription items are outside the single-unit plan model');
  }
  const item = items.data[0];
  const priceId = item.price.id;

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : (subscription.customer?.id ?? '');

  return {
    tenant_id: tenantId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    stripe_price_id: priceId,
    status: mapSubscriptionStatus(subscription.status),
    plan: mapPriceIdToPlan(priceId),
    current_period_start: isoFromUnix(
      (subscription as unknown as { current_period_start?: number })
        .current_period_start ?? item?.current_period_start,
    ),
    current_period_end: isoFromUnix(
      (subscription as unknown as { current_period_end?: number })
        .current_period_end ?? item?.current_period_end,
    ),
    trial_start: isoFromUnix(subscription.trial_start),
    trial_end: isoFromUnix(subscription.trial_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    canceled_at: isoFromUnix(subscription.canceled_at),
    last_webhook_at: new Date().toISOString(),
  };
}

type SubscriptionReference = string | { id?: string } | null | undefined;

function subscriptionId(value: SubscriptionReference): string | null {
  if (typeof value === 'string') return value || null;
  return value?.id || null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const shape = invoice as Stripe.Invoice & {
    subscription?: SubscriptionReference;
    parent?: {
      type?: string;
      subscription_details?: { subscription?: SubscriptionReference } | null;
    } | null;
  };
  const legacy = subscriptionId(shape.subscription);
  const parent = shape.parent;
  if (parent?.type === 'subscription_details') {
    const current = subscriptionId(parent.subscription_details?.subscription);
    if (!current) {
      throw new Error(`subscription parent has no reference on invoice ${invoice.id}`);
    }
    if (legacy && legacy !== current) {
      throw new Error(`conflicting subscription references on invoice ${invoice.id}`);
    }
    return current;
  }
  if (parent && parent.type && legacy) {
    throw new Error(`conflicting subscription parent type on invoice ${invoice.id}`);
  }
  return legacy;
}

/**
 * Legacy invoice snapshots sometimes carry one direct payment reference.
 * Basil+ exposes invoice payments in another shape; we do not infer that
 * structure here without a verified contract. If neither legacy field can
 * prove the payment identity, the signed event requires reconciliation before writes.
 * Both valid legacy references may coexist in a signed invoice; retain both
 * for reconciliation without deriving tenant identity from either alone.
 */
function legacyInvoicePaymentReferences(
  invoice: Stripe.Invoice,
  requireReference: boolean,
): { paymentIntentId: string | null; chargeId: string | null } {
  const refs = invoice as unknown as {
    payment_intent?: unknown;
    charge?: unknown;
  };
  const paymentIntent = refs.payment_intent;
  const charge = refs.charge;
  const hasPaymentIntent = paymentIntent !== null && paymentIntent !== undefined;
  const hasCharge = charge !== null && charge !== undefined;

  if ((hasPaymentIntent &&
       (typeof paymentIntent !== 'string' ||
        !/^pi_[A-Za-z0-9]{8,}$/.test(paymentIntent))) ||
      (hasCharge &&
       (typeof charge !== 'string' ||
        !/^ch_[A-Za-z0-9]{8,}$/.test(charge))) ||
      (requireReference && !hasPaymentIntent && !hasCharge)) {
    throw new ReconciliationRequiredWebhookError(
      'Stripe invoice payment reference missing or invalid',
    );
  }

  return {
    paymentIntentId: hasPaymentIntent ? paymentIntent as string : null,
    chargeId: hasCharge ? charge as string : null,
  };
}

/**
 * Invoice (succeeded/failed) to a stripe_payments row.
 * Returns null only for an actual one-time invoice without a subscription.
 */
export interface PaymentRowResult {
  tenantId: string;
  row: Record<string, unknown>;
}

export async function mapInvoiceToPaymentRow(
  invoice: Stripe.Invoice,
  status: 'succeeded' | 'failed',
): Promise<PaymentRowResult | null> {
  // Acacia sends top-level subscription; Basil+ uses parent.subscription_details.
  const subscriptionRef = invoiceSubscriptionId(invoice);
  if (!subscriptionRef) return null;

  // The signed Stripe invoice is the authority for the payment date. A
  // delivery without it cannot create a payment row or schedule a VAT job.
  const paidAt = status === 'succeeded' ? paidAtFromInvoice(invoice) : null;
  const paymentRefs = legacyInvoicePaymentReferences(
    invoice,
    status === 'succeeded',
  );

  const supabase = createAdminClient();

  // Subscription row musi już istnieć (created przed payment_succeeded).
  // Cast: tabela nie w typed gen.
  const subResult = (await (supabase as unknown as {
    from: (n: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => {
          maybeSingle: () => Promise<{
            data: { id: string; tenant_id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('subscriptions')
    .select('id, tenant_id')
    .eq('stripe_subscription_id', subscriptionRef)
    .maybeSingle());

  if (subResult.error) {
    throw new RetryablePreEffectWebhookError(
      'subscription_lookup_failed',
      `subscription lookup failed: ${subResult.error.message}`,
    );
  }
  if (!subResult.data) {
    // The subscription.created webhook may arrive after the invoice webhook.
    throw new RetryablePreEffectWebhookError(
      'subscription_not_found',
      `subscription ${subscriptionRef} not found for invoice ${invoice.id}`,
    );
  }

  // Stripe v22: `invoice.tax` zostało zastąpione przez `total_taxes` (Array<{amount}>)
  // — sumujemy żeby dostać total VAT w cents.
  const totalTaxes = (invoice as unknown as {
    total_taxes?: Array<{ amount?: number | null }> | null;
  }).total_taxes;
  const taxCents = Array.isArray(totalTaxes)
    ? totalTaxes.reduce((sum, t) => sum + (t.amount ?? 0), 0)
    : 0;

  return {
    tenantId: subResult.data.tenant_id,
    row: {
      tenant_id: subResult.data.tenant_id,
      subscription_id: subResult.data.id,
      stripe_payment_intent_id: paymentRefs.paymentIntentId,
      stripe_invoice_id: invoice.id,
      stripe_charge_id: paymentRefs.chargeId,
      status,
      amount_cents: status === 'succeeded' ? invoice.amount_paid : invoice.amount_due,
      currency: (invoice.currency ?? 'pln').toLowerCase(),
      tax_cents: taxCents,
      paid_at: paidAt,
      failure_reason:
        status === 'failed'
          ? ((invoice as unknown as { last_finalization_error?: { message?: string } })
              .last_finalization_error?.message ?? null)
          : null,
      last_webhook_payload: invoice as never,
    },
  };
}
