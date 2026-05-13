/**
 * Stripe webhook endpoint (Faza 25 Krok 3).
 *
 * Setup w Stripe Dashboard → Webhooks → Add endpoint:
 *   URL:  https://app.faktflow.pl/api/stripe/webhook
 *   Events: subscribe TYLKO do tych których obsługujemy (lista w `HANDLED_EVENTS`).
 *
 * Bezpieczeństwo:
 *   1. **Signature verification** przez `stripe.webhooks.constructEvent` z raw body.
 *      Bez tego ktoś z internetu mógłby spamować nasze handlery payload'ami.
 *   2. **Idempotency** przez `stripe_webhook_events.id = evt_*` — UNIQUE,
 *      ponowne dostarczenie się pomija.
 *   3. **Runtime: nodejs** — edge runtime nie ma Buffer/raw body access.
 *
 * Performance:
 *   - Stripe oczekuje 200 OK w < 5s — handlery powinny być szybkie. Długie
 *     operacje (self-invoicing przez KSeF — Krok 4) idą do Inngest async.
 *   - Idempotency check jest pierwszą operacją (1 DB hit) — szybko zwracamy
 *     200 OK dla duplikatów.
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import * as Sentry from '@sentry/nextjs';

import { getStripe } from '@/lib/stripe/client';
import {
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  handleSubscriptionDeleted,
  handleSubscriptionUpserted,
  handleTrialWillEnd,
} from '@/lib/stripe/webhook-handlers';
import {
  finalizeWebhookEvent,
  tryClaimWebhookEvent,
} from '@/lib/stripe/webhook-store';

export const runtime = 'nodejs';
// Stripe nie wysyła GET preflight, ale `dynamic: 'force-dynamic'` chroni
// przed cache'owaniem Vercel Edge przy ewentualnym GET probe.
export const dynamic = 'force-dynamic';

const HANDLED_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
]);

export async function POST(req: Request): Promise<Response> {
  const stripeSignature = req.headers.get('stripe-signature');
  if (!stripeSignature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    Sentry.captureMessage('Stripe webhook received but STRIPE_WEBHOOK_SECRET missing', {
      level: 'error',
    });
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 },
    );
  }

  // Raw body wymagane do signature verify. `req.text()` nie parsuje JSON.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, stripeSignature, webhookSecret);
  } catch (err) {
    // Zła signature = bezpieczeństwo, nie hałasujmy w Sentry per request
    // (atakujący mógłby zalać error tracking).
    return NextResponse.json(
      {
        error: 'Invalid signature',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 400 },
    );
  }

  // Skip unhandled event types — Stripe może wysyłać więcej niż subskrybujemy
  // jeśli ktoś w dashboard zmieni listę. Tylko 200 OK + komentarz.
  if (!HANDLED_EVENTS.has(event.type)) {
    return NextResponse.json({ skipped: true, type: event.type });
  }

  // Idempotency claim — pierwszy raz = dostajemy `claimed: true`. Powtórka =
  // `false`, zwracamy 200 OK natychmiast bez ponownego procesowania.
  let claim: { claimed: boolean };
  try {
    claim = await tryClaimWebhookEvent(event.id, event.type, event);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'stripe.webhook.idempotency' } });
    return NextResponse.json({ error: 'Idempotency check failed' }, { status: 500 });
  }
  if (!claim.claimed) {
    return NextResponse.json({ duplicate: true, eventId: event.id });
  }

  // Dispatch po typie eventu. Każdy handler ma własną tabelę audytu +
  // ewentualny Inngest event do downstream.
  try {
    await dispatch(event);
    await finalizeWebhookEvent(event.id, 'processed');
    return NextResponse.json({ received: true, eventId: event.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await finalizeWebhookEvent(event.id, 'failed', message);
    Sentry.captureException(err, {
      tags: { area: 'stripe.webhook.dispatch', eventType: event.type },
      extra: { eventId: event.id },
    });
    // **WAŻNE**: zwracamy 500 żeby Stripe ponowił dostawę (retry policy
    // Stripe = exponential backoff przez 3 dni). Idempotency tabela
    // sprawi że duplikat się nie wpisze drugi raz, więc retry jest safe.
    return NextResponse.json(
      { error: 'Handler failed', detail: message },
      { status: 500 },
    );
  }
}

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
      await handleSubscriptionUpserted(event.data.object as Stripe.Subscription, true);
      return;
    case 'customer.subscription.updated':
      await handleSubscriptionUpserted(event.data.object as Stripe.Subscription, false);
      return;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    case 'customer.subscription.trial_will_end':
      await handleTrialWillEnd(event.data.object as Stripe.Subscription);
      return;
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      return;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return;
  }
}
