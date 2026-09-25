/**
 * Stripe Checkout Session (Faza 25 Krok 2).
 *
 * Flow:
 *   1. Klient klika "Subskrybuj" w `/settings/billing` (plan: monthly|annual)
 *   2. Server action `startCheckoutAction` woła `createCheckoutSession`
 *   3. Klient jest redirectowany na Stripe Checkout (hosted)
 *   4. Po sukcesie wraca na `success_url` z `?session_id=cs_...`
 *      (idempotent — webhook robi pracę, page tylko pokazuje toast)
 *   5. Webhook `checkout.session.completed` + `customer.subscription.created`
 *      tworzy `subscriptions` row (Krok 3)
 *
 * Trial: 30 dni, ustawiony w `subscription_data.trial_period_days`. Stripe
 * nie pobiera płatności przez te 30 dni, ale klient musi już dać kartę
 * w Checkout (lepsze conversion vs no-card trial — eliminuje ghost trials).
 */

import * as Sentry from '@sentry/nextjs';
import type Stripe from 'stripe';

import { logAuditSystem } from '@/lib/audit/log-system';

import { getActiveSubscription } from './subscription';
import { getStripe } from './client';
import { ensureStripeCustomer } from './customer';
import { getConfiguredStripePriceIds } from './event-mapping';

export type CheckoutPlan = 'monthly' | 'annual';

const TRIAL_DAYS = 30;

export interface CreateCheckoutInput {
  tenantId: string;
  /** Owner email — primary contact (Stripe wymaga). */
  email: string;
  tenantName?: string;
  nip?: string;
  plan: CheckoutPlan;
  /** Base URL do redirectu — np. `https://app.faktflow.pl`. */
  baseUrl: string;
}

function resolvePriceId(plan: CheckoutPlan): string {
  if (plan !== 'monthly' && plan !== 'annual') {
    throw new Error('Invalid Stripe checkout plan');
  }
  return getConfiguredStripePriceIds()[plan];
}

export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<{ sessionId: string; url: string }> {
  // Fail before creating a Customer or Session when the plan or configuration is invalid.
  const priceId = resolvePriceId(input.plan);
  const stripe = getStripe();

  // A local row can already exist even while Stripe is unavailable. Any
  // nonterminal subscription blocks another trial/paid Checkout.
  if (await getActiveSubscription(input.tenantId)) {
    throw new Error('Tenant already has a nonterminal subscription');
  }

  // 1. Ensure customer (idempotent — nie tworzy duplikatu).
  const { customerId } = await ensureStripeCustomer({
    tenantId: input.tenantId,
    email: input.email,
    name: input.tenantName,
    nip: input.nip,
  });

  // The webhook mirror can lag behind Stripe. Fail closed if Stripe has a
  // subscription for this Customer, including incomplete or paused statuses.
  const existing = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  });
  if (existing.has_more || existing.data.some(
    (subscription) =>
      subscription.status !== 'canceled' &&
      subscription.status !== 'incomplete_expired',
  )) {
    throw new Error('Stripe customer already has a nonterminal subscription');
  }

  // 2. Create Checkout Session. Stripe deduplicates same-tenant requests
  // within an hour; a different plan in that window conflicts rather than
  // silently creating another session. This is not a durable cross-window
  // lock: only a database claim can close that remaining race.
  const idempotencyKey =
    `faktflow-checkout-v1:${input.tenantId}:${Math.floor(Date.now() / 3_600_000)}`;
  const session: Stripe.Checkout.Session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    // Subskrypcja z trialem 30 dni — w tym czasie Stripe nie pobiera płatności,
    // ale karta jest już zapisana = brak ghost-trials.
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      // Synchronizacja z naszą bazą — `subscription.metadata.tenantId` jest
      // backup'em gdy `customer.metadata` miałby być nieobecny.
      metadata: {
        tenantId: input.tenantId,
        plan: input.plan,
      },
    },
    // VAT handling — Stripe Tax automatycznie liczy 23% PL VAT gdy włączone
    // w dashboardzie. Bez Stripe Tax: ceny w Stripe są tax-inclusive (gross),
    // self-invoicing wystawi fakturę z VAT extracted po stronie naszej apki.
    automatic_tax: { enabled: false },
    // Promo codes działają od dnia 1 — nie blokujemy się na potem.
    allow_promotion_codes: true,

    success_url: `${input.baseUrl}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.baseUrl}/settings/billing?checkout=canceled`,

    // metadata na session — webhook `checkout.session.completed` użyje tego do
    // szybkiego dispatchu zanim subscription row się pojawi w DB.
    metadata: {
      tenantId: input.tenantId,
      plan: input.plan,
    },

    // Faktura/invoice w Stripe dla user'a — pomocnicze dla księgowości operatora.
    // Self-invoicing (Krok 4) generuje OSOBNĄ fakturę VAT w naszym KSeF.
    invoice_creation: undefined, // mode=subscription już generuje invoice
  }, { idempotencyKey });

  if (!session.url) {
    throw new Error('Stripe Checkout Session bez url — unexpected response');
  }

  // Audit log — operator może odtworzyć kontekst gdy klient zgłosi problem
  // ("kliknąłem Subskrybuj ale Stripe pokazał błąd").
  try {
    await logAuditSystem({
      action: 'billing.checkout.session_created',
      tenantId: input.tenantId,
      userId: null,
      entityType: 'stripe_session',
      entityId: session.id,
      metadata: {
        plan: input.plan,
        customerId,
        amountCents: session.amount_total ?? null,
        currency: session.currency ?? 'pln',
      },
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { area: 'billing.audit' },
      extra: { sessionId: session.id, tenantId: input.tenantId },
    });
  }

  return { sessionId: session.id, url: session.url };
}
