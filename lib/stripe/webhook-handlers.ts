/**
 * Stripe webhook event handlers (Faza 25 Krok 3).
 *
 * 6 krytycznych events:
 *   - customer.subscription.created → INSERT subscriptions
 *   - customer.subscription.updated → UPDATE (status, plan, period, cancel flag)
 *   - customer.subscription.deleted → status='canceled' + canceled_at
 *   - invoice.payment_succeeded   → INSERT stripe_payments + Inngest event
 *                                   (Krok 4 self-invoicing trigger)
 *   - invoice.payment_failed      → INSERT stripe_payments + Inngest dunning
 *   - customer.subscription.trial_will_end → audit (trial emails run from a cron)
 *
 * Każdy handler jest idempotent: `subscriptions.stripe_subscription_id`
 * jest UNIQUE, więc UPSERT z onConflict załatwia ponowne odpalenia.
 */

import { sendJobEvent } from '@/lib/jobs/enqueue';
import type Stripe from 'stripe';

import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { trackServer } from '@/lib/analytics/server';
import { logAuditSystem } from '@/lib/audit/log-system';
import {
  billingPaymentFailed,
  billingPaymentSucceeded,
} from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';

import {
  mapInvoiceToPaymentRow,
  mapSubscriptionToRow,
  resolveTenantIdFromSubscription,
} from './event-mapping';

/**
 * Late invoice payment events must not reopen an already refunded payment.
 * The database trigger in 00075 also covers a race after this read.
 */
async function readStripePaymentStatus(
  supabase: ReturnType<typeof createAdminClient>,
  stripeInvoiceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('stripe_payments')
    .select('status')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle();
  if (error) {
    throw new Error('stripe payment status read failed: ' + error.message);
  }
  return data?.status ?? null;
}

function isRefundedPaymentStatus(status: string | null): boolean {
  return status === 'refunded' || status === 'partially_refunded';
}
// ─── 1. subscription.created / updated ────────────────────────────────

export async function handleSubscriptionUpserted(
  subscription: Stripe.Subscription,
  isCreate: boolean,
): Promise<void> {
  const tenantId = await resolveTenantIdFromSubscription(subscription);
  const supabase = createAdminClient();
  const row = mapSubscriptionToRow(subscription, tenantId);

  const { data: persistedRows, error } = await supabase
    .from('subscriptions')
    // Cast — tabela poza typed gen do regeneracji.
    .upsert(row as never, { onConflict: 'stripe_subscription_id' })
    .select('status');

  if (error) {
    throw new Error(`subscription upsert failed: ${error.message}`);
  }
  const persisted = persistedRows?.[0];
  if (!persisted) {
    // The DB guard can suppress an older update after cancellation. Verify
    // the terminal state; an unexplained zero-row write must remain retryable.
    const { data: current, error: readError } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();
    if (readError) throw new Error(`subscription status read failed: ${readError.message}`);
    if (current?.status === 'canceled' && row.status !== 'canceled') return;
    throw new Error(`subscription upsert affected no row: ${subscription.id}`);
  }
  if (persisted.status === 'canceled' && row.status !== 'canceled') return;

  await logAuditSystem({
    action: isCreate ? 'billing.subscription.created' : 'billing.subscription.updated',
    tenantId,
    userId: null,
    entityType: 'subscription',
    entityId: subscription.id,
    metadata: {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      priceId: subscription.items.data[0]?.price.id ?? null,
    },
  });

  if (isCreate) {
    await trackServer({
      distinctId: tenantId,
      event: ANALYTICS_EVENTS.subscriptionCreated,
      properties: {
        status: subscription.status,
        price_id: subscription.items.data[0]?.price.id ?? null,
      },
      setPersonProperties: { plan: 'active' },
    });
  }
}

// ─── 2. subscription.deleted ──────────────────────────────────────────

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const tenantId = await resolveTenantIdFromSubscription(subscription);
  const supabase = createAdminClient();
  const canceledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000).toISOString()
    : new Date().toISOString();

  const canceledRow = {
    status: 'canceled',
    canceled_at: canceledAt,
    cancel_at_period_end: false,
    last_webhook_at: new Date().toISOString(),
  };
  const updateOwned = async () => supabase
    .from('subscriptions')
    .update(canceledRow as never)
    .eq('stripe_subscription_id', subscription.id)
    .eq('tenant_id', tenantId)
    .select('id, status')
    .maybeSingle();

  const { data: initiallyUpdated, error } = await updateOwned();
  let updated = initiallyUpdated;
  if (error) throw new Error(`subscription delete update failed: ${error.message}`);
  if (!updated) {
    // A deleted webhook can precede created. Insert a canceled tombstone without
    // updating an existing subscription's tenant or customer on conflict.
    const mapped = mapSubscriptionToRow(subscription, tenantId);
    if (!subscription.id || mapped.tenant_id !== tenantId ||
        mapped.stripe_subscription_id !== subscription.id ||
        typeof mapped.stripe_customer_id !== 'string' || !mapped.stripe_customer_id ||
        typeof mapped.stripe_price_id !== 'string' || !mapped.stripe_price_id) {
      throw new Error(`subscription delete snapshot is incomplete: ${subscription.id}`);
    }
    const { data: inserted, error: insertError } = await supabase
      .from('subscriptions')
      .upsert({ ...mapped, ...canceledRow } as never, {
        onConflict: 'stripe_subscription_id',
        ignoreDuplicates: true,
      })
      .select('id, tenant_id, status');
    if (insertError) throw new Error(`subscription delete insert failed: ${insertError.message}`);

    if (inserted?.length) {
      const tombstone = inserted[0];
      if (tombstone.tenant_id !== tenantId || tombstone.status !== 'canceled') {
        throw new Error(`subscription delete tombstone mismatch: ${subscription.id}`);
      }
      updated = tombstone;
    } else {
      // created may have won the unique-key race. Cancel only a row owned by
      // the resolved tenant; a mismatched owner is a manual reconciliation.
      const retried = await updateOwned();
      if (retried.error) {
        throw new Error(`subscription delete update failed: ${retried.error.message}`);
      }
      updated = retried.data;
    }
  }
  if (!updated || updated.status !== 'canceled') {
    throw new Error(`subscription delete not persisted for tenant: ${subscription.id}`);
  }

  await logAuditSystem({
    action: 'billing.subscription.canceled',
    tenantId,
    userId: null,
    entityType: 'subscription',
    entityId: subscription.id,
    metadata: { canceledAt },
  });

  await trackServer({
    distinctId: tenantId,
    event: ANALYTICS_EVENTS.subscriptionCanceled,
    properties: { subscription_id: subscription.id },
    setPersonProperties: { plan: 'canceled' },
  });
}

// ─── 3. invoice.payment_succeeded ─────────────────────────────────────

export async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
): Promise<void> {
  const mapping = await mapInvoiceToPaymentRow(invoice, 'succeeded');
  if (!mapping) return;

  const supabase = createAdminClient();
  if (isRefundedPaymentStatus(await readStripePaymentStatus(supabase, invoice.id))) return;
  // Cast — `stripe_payments` poza typed gen.
  const { data, error } = await (supabase as unknown as {
    from: (n: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => {
        select: (c: string) => Promise<{
          data: Array<{ id: string; status: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  })
    .from('stripe_payments')
    .upsert(mapping.row, { onConflict: 'stripe_invoice_id' })
    .select('id, status');

  if (error) {
    throw new Error(`stripe_payments upsert failed: ${error.message}`);
  }

  const persistedPayment = data?.[0];
  if (!persistedPayment) {
    // A refund guard can suppress the upsert. Any other zero-row result leaves
    // the payment event unpersisted and must be retried.
    const currentStatus = await readStripePaymentStatus(supabase, invoice.id);
    if (isRefundedPaymentStatus(currentStatus)) return;
    throw new Error(`stripe payment success upsert affected no row: ${invoice.id}`);
  }
  if (isRefundedPaymentStatus(persistedPayment.status)) return;
  if (persistedPayment.status !== 'succeeded') {
    throw new Error(`stripe payment success not persisted: ${invoice.id}`);
  }
  const paymentId = persistedPayment.id;

  await logAuditSystem({
    action: 'billing.payment.succeeded',
    tenantId: mapping.tenantId,
    userId: null,
    entityType: 'stripe_payment',
    entityId: paymentId,
    metadata: {
      stripeInvoiceId: invoice.id,
      amountCents: invoice.amount_paid,
      taxCents: ((invoice as unknown as { total_taxes?: Array<{ amount?: number | null }> | null }).total_taxes ?? []).reduce((s, t) => s + (t.amount ?? 0), 0),
      currency: invoice.currency,
    },
  });

  // Inngest event — uruchamia self-invoicing przez KSeF (Krok 4).
  await sendJobEvent({
    // Grupa per tenant — jedna faktura własna naraz (parytet z Inngest).
    groupId: mapping.tenantId,
    ...billingPaymentSucceeded.create({
      tenantId: mapping.tenantId,
      paymentId,
      stripeInvoiceId: invoice.id ?? '',
      amountCents: invoice.amount_paid,
      taxCents: ((invoice as unknown as { total_taxes?: Array<{ amount?: number | null }> | null }).total_taxes ?? []).reduce((s, t) => s + (t.amount ?? 0), 0),
      currency: (invoice.currency ?? 'pln').toLowerCase(),
      paidAt:
        invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
          : new Date().toISOString(),
    }),
  });

  // Analytics — payment_succeeded. Subskrypcja jest per-tenant, więc
  // `distinctId = tenantId` (UUID nie koliduje z userId).
  await trackServer({
    distinctId: mapping.tenantId,
    event: ANALYTICS_EVENTS.paymentSucceeded,
    properties: {
      amount_cents: invoice.amount_paid,
      currency: (invoice.currency ?? 'pln').toLowerCase(),
      stripe_invoice_id: invoice.id ?? '',
    },
  });
}

// ─── 4. invoice.payment_failed ────────────────────────────────────────

export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  const mapping = await mapInvoiceToPaymentRow(invoice, 'failed');
  if (!mapping) return;

  const supabase = createAdminClient();
  const existingStatus = await readStripePaymentStatus(supabase, invoice.id);
  if (existingStatus === 'succeeded' || isRefundedPaymentStatus(existingStatus)) return;
  const { data, error } = await (supabase as unknown as {
    from: (n: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => {
        select: (c: string) => Promise<{
          data: Array<{ id: string; status: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  })
    .from('stripe_payments')
    .upsert(mapping.row, { onConflict: 'stripe_invoice_id' })
    .select('id, status');

  if (error) {
    throw new Error(`stripe_payments failed upsert: ${error.message}`);
  }

  const persistedPayment = data?.[0];
  if (!persistedPayment) {
    const currentStatus = await readStripePaymentStatus(supabase, invoice.id);
    if (currentStatus === 'succeeded' || isRefundedPaymentStatus(currentStatus)) return;
    throw new Error(`stripe payment failure upsert affected no row: ${invoice.id}`);
  }
  if (persistedPayment.status === 'succeeded' ||
      isRefundedPaymentStatus(persistedPayment.status)) return;
  if (persistedPayment.status !== 'failed') {
    throw new Error(`stripe payment failure not persisted: ${invoice.id}`);
  }
  const paymentId = persistedPayment.id;

  const failureReason =
    (mapping.row.failure_reason as string | null | undefined) ?? null;

  await logAuditSystem({
    action: 'billing.payment.failed',
    tenantId: mapping.tenantId,
    userId: null,
    entityType: 'stripe_payment',
    entityId: paymentId,
    metadata: {
      stripeInvoiceId: invoice.id,
      amountCents: invoice.amount_due,
      currency: invoice.currency,
      failureReason,
    },
  });

  await sendJobEvent({
    groupId: mapping.tenantId,
    ...billingPaymentFailed.create({
      tenantId: mapping.tenantId,
      paymentId,
      stripeInvoiceId: invoice.id ?? '',
      failureReason,
    }),
  });

  await trackServer({
    distinctId: mapping.tenantId,
    event: ANALYTICS_EVENTS.paymentFailed,
    properties: {
      amount_cents: invoice.amount_due,
      currency: (invoice.currency ?? 'pln').toLowerCase(),
      failure_reason: failureReason,
    },
  });
}

// ─── 5. subscription.trial_will_end ───────────────────────────────────

export async function handleTrialWillEnd(
  subscription: Stripe.Subscription,
): Promise<void> {
  const tenantId = await resolveTenantIdFromSubscription(subscription);
  const trialEndIso = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : new Date().toISOString();

  await logAuditSystem({
    action: 'billing.trial.will_end',
    tenantId,
    userId: null,
    entityType: 'subscription',
    entityId: subscription.id,
    metadata: { trialEnd: trialEndIso },
  });
}
