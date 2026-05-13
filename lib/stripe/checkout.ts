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

import { getStripe } from './client';
import { ensureStripeCustomer } from './customer';

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
  const id =
    plan === 'monthly'
      ? process.env.STRIPE_PRICE_MONTHLY
      : process.env.STRIPE_PRICE_ANNUAL;
  if (!id) {
    throw new Error(
      `STRIPE_PRICE_${plan.toUpperCase()} env var missing — utwórz Price w Stripe Dashboard`,
    );
  }
  return id;
}

export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe();

  // 1. Ensure customer (idempotent — nie tworzy duplikatu).
  const { customerId } = await ensureStripeCustomer({
    tenantId: input.tenantId,
    email: input.email,
    name: input.tenantName,
    nip: input.nip,
  });

  // 2. Create Checkout Session.
  const session: Stripe.Checkout.Session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    // Subskrypcja z trialem 30 dni — w tym czasie Stripe nie pobiera płatności,
    // ale karta jest już zapisana = brak ghost-trials.
    line_items: [
      {
        price: resolvePriceId(input.plan),
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
  });

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
