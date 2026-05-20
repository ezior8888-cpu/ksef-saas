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
 *   - customer.subscription.trial_will_end → Inngest event (Krok 5 email)
 *
 * Każdy handler jest idempotent: `subscriptions.stripe_subscription_id`
 * jest UNIQUE, więc UPSERT z onConflict załatwia ponowne odpalenia.
 */

import * as Sentry from '@sentry/nextjs';
import type Stripe from 'stripe';

import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { trackServer } from '@/lib/analytics/server';
import { logAuditSystem } from '@/lib/audit/log-system';
import {
  billingPaymentFailed,
  billingPaymentSucceeded,
  billingSubscriptionCanceled,
  billingTrialWillEnd,
  inngest,
} from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';

import {
  mapInvoiceToPaymentRow,
  mapSubscriptionToRow,
  resolveTenantIdFromSubscription,
} from './event-mapping';

// ─── 1. subscription.created / updated ────────────────────────────────

export async function handleSubscriptionUpserted(
  subscription: Stripe.Subscription,
  isCreate: boolean,
): Promise<void> {
  const tenantId = await resolveTenantIdFromSubscription(subscription);
  if (!tenantId) {
    Sentry.captureMessage('Stripe subscription bez tenantId metadata', {
      level: 'warning',
      extra: { subscriptionId: subscription.id },
    });
    return;
  }

  const supabase = createAdminClient();
  const row = mapSubscriptionToRow(subscription, tenantId);

  const { error } = await supabase
    .from('subscriptions')
    // Cast — tabela poza typed gen do regeneracji.
    .upsert(row as never, { onConflict: 'stripe_subscription_id' });

  if (error) {
    throw new Error(`subscription upsert failed: ${error.message}`);
  }

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
  if (!tenantId) return;

  const supabase = createAdminClient();
  const canceledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000).toISOString()
    : new Date().toISOString();

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: canceledAt,
      cancel_at_period_end: false,
      last_webhook_at: new Date().toISOString(),
    } as never)
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    throw new Error(`subscription delete update failed: ${error.message}`);
  }

  await logAuditSystem({
    action: 'billing.subscription.canceled',
    tenantId,
    userId: null,
    entityType: 'subscription',
    entityId: subscription.id,
    metadata: { canceledAt },
  });

  // Inngest event — konsumenci re-engagement campaign mogą zaplanować
  // sequence emaili "wracaj do nas".
  await inngest.send(
    billingSubscriptionCanceled.create({
      tenantId,
      subscriptionId: subscription.id,
      canceledAt,
    }),
  );

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
  // Cast — `stripe_payments` poza typed gen.
  const { data, error } = await (supabase as unknown as {
    from: (n: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => {
        select: (c: string) => Promise<{
          data: Array<{ id: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  })
    .from('stripe_payments')
    .upsert(mapping.row, { onConflict: 'stripe_invoice_id' })
    .select('id');

  if (error) {
    throw new Error(`stripe_payments upsert failed: ${error.message}`);
  }

  const paymentId = data?.[0]?.id;
  if (!paymentId) return;

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
  await inngest.send(
    billingPaymentSucceeded.create({
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
  );

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
  const { data, error } = await (supabase as unknown as {
    from: (n: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => {
        select: (c: string) => Promise<{
          data: Array<{ id: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  })
    .from('stripe_payments')
    .upsert(mapping.row, { onConflict: 'stripe_invoice_id' })
    .select('id');

  if (error) {
    throw new Error(`stripe_payments failed upsert: ${error.message}`);
  }

  const paymentId = data?.[0]?.id;
  if (!paymentId) return;

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

  await inngest.send(
    billingPaymentFailed.create({
      tenantId: mapping.tenantId,
      paymentId,
      stripeInvoiceId: invoice.id ?? '',
      failureReason,
    }),
  );

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
  if (!tenantId) return;

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

  await inngest.send(
    billingTrialWillEnd.create({
      tenantId,
      subscriptionId: subscription.id,
      trialEnd: trialEndIso,
    }),
  );
}
