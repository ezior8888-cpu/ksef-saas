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
  return 'incomplete';
}

/**
 * Wyznacza plan na podstawie Price ID. Mapowanie sterowane env vars
 * (`STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL`) — bez tego nie wiemy
 * który Price ID = który plan.
 */
export function mapPriceIdToPlan(priceId: string | null | undefined): SubscriptionPlan {
  if (!priceId) return 'monthly';
  if (priceId === process.env.STRIPE_PRICE_ANNUAL) return 'annual';
  return 'monthly';
}

function isoFromUnix(unix: number | null | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

/**
 * Wyciąga tenantId z `subscription.metadata.tenantId`. Fallback: lookup
 * po `customer.metadata.tenantId` (gdy subscription stworzona bez metadata).
 *
 * Zwraca `null` gdy nie da się ustalić — handler loguje warning i skip'uje
 * event (lepsze niż wpisanie do "unknown tenant").
 */
export async function resolveTenantIdFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.tenantId;
  if (fromMetadata) return fromMetadata;

  // Fallback: zapytaj Stripe o customer'a (rzadko ale klasyk).
  const customerRef =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerRef) return null;

  const { getStripe } = await import('./client');
  const stripe = getStripe();
  try {
    const customer = await stripe.customers.retrieve(customerRef);
    if (customer.deleted) return null;
    return customer.metadata?.tenantId ?? null;
  } catch {
    return null;
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
  // z pierwszego item'a (subscription ma 1 line w naszym modelu).
  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? '';

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

/**
 * Invoice (succeeded/failed) → row dla `stripe_payments`.
 * Returns `null` gdy invoice nie jest powiązany z subscription (np. one-time charge).
 */
export interface PaymentRowResult {
  tenantId: string;
  row: Record<string, unknown>;
}

export async function mapInvoiceToPaymentRow(
  invoice: Stripe.Invoice,
  status: 'succeeded' | 'failed',
): Promise<PaymentRowResult | null> {
  // Wyciągamy tenantId z subscription metadata. Bez subscription = one-time
  // charge (rzadkie w naszym modelu), skip.
  const subscriptionRef =
    typeof (invoice as unknown as { subscription?: string | Stripe.Subscription })
      .subscription === 'string'
      ? ((invoice as unknown as { subscription: string }).subscription)
      : ((invoice as unknown as { subscription?: Stripe.Subscription })
          .subscription?.id ?? null);

  if (!subscriptionRef) return null;

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

  if (!subResult.data) {
    return null;
  }

  const invoiceWithIds = invoice as unknown as {
    payment_intent?: string | null;
    charge?: string | null;
  };

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
      stripe_payment_intent_id: invoiceWithIds.payment_intent ?? null,
      stripe_invoice_id: invoice.id,
      stripe_charge_id: invoiceWithIds.charge ?? null,
      status,
      amount_cents: status === 'succeeded' ? invoice.amount_paid : invoice.amount_due,
      currency: (invoice.currency ?? 'pln').toLowerCase(),
      tax_cents: taxCents,
      paid_at: status === 'succeeded' ? isoFromUnix(invoice.status_transitions?.paid_at) : null,
      failure_reason:
        status === 'failed'
          ? ((invoice as unknown as { last_finalization_error?: { message?: string } })
              .last_finalization_error?.message ?? null)
          : null,
      last_webhook_payload: invoice as never,
    },
  };
}
