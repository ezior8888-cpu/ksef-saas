/**
 * Stripe Customer lifecycle (Faza 25 Krok 1).
 *
 * Jedna funkcja `ensureStripeCustomer(tenantId)`:
 *   - jeśli `tenants.stripe_customer_id` istnieje → fetch z Stripe i return
 *   - jeśli brak → create new Customer + zapis do DB + return
 *
 * Idempotent — bezpiecznie woływana wielokrotnie. Lazy creation: nie tworzymy
 * Customer'a przy onboardingu (lekki insert), tylko gdy user faktycznie zbliża
 * się do billingu (otwarcie /settings/billing, Checkout). Oszczędza zaśmiecanie
 * Stripe dashboardu cancellowanymi trialami które nigdy nie weszły w płatność.
 */

import * as Sentry from '@sentry/nextjs';
import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/supabase/admin';

import { getStripe } from './client';

export interface EnsureCustomerInput {
  tenantId: string;
  /** Owner email — primary contact w Stripe (faktury, reminder maile). */
  email: string;
  /** Nazwa firmy z `tenants.name` — pokazuje się w Stripe dashboard + invoice. */
  name?: string;
  nip?: string;
}

export async function ensureStripeCustomer(
  input: EnsureCustomerInput,
): Promise<{ customerId: string; created: boolean }> {
  const supabase = createAdminClient();

  // Read existing customer_id (jeśli jest, to wystarczy — Stripe traktuje
  // `cus_*` jako idempotent natural key).
  const { data: tenant, error: selErr } = await supabase
    .from('tenants')
    .select('stripe_customer_id')
    .eq('id', input.tenantId)
    .maybeSingle();

  if (selErr) {
    throw new Error(`tenant lookup failed: ${selErr.message}`);
  }
  if (tenant?.stripe_customer_id) {
    return { customerId: tenant.stripe_customer_id, created: false };
  }

  // Create new Customer w Stripe.
  const stripe = getStripe();
  const customer: Stripe.Customer = await stripe.customers.create({
    email: input.email,
    name: input.name,
    description: input.nip ? `NIP ${input.nip}` : undefined,
    metadata: {
      // Critical: tenantId musi się zgadzać 1:1 ze stripe_customer_id.
      // Webhook handler używa `metadata.tenantId` jako primary lookup.
      tenantId: input.tenantId,
      ...(input.nip ? { nip: input.nip } : {}),
    },
    // Pre-fill VAT number gdy mamy NIP — Stripe Tax automatycznie zastosuje
    // PL reverse-charge dla B2B EU (gdy mamy company NIP, klient zostanie
    // potraktowany jako business).
    ...(input.nip
      ? {
          tax_id_data: [
            { type: 'eu_vat', value: `PL${input.nip}` },
          ],
        }
      : {}),
  });

  // Persist customer_id na tenant. Race condition: jeśli dwa serwery
  // równolegle wywołują ensureStripeCustomer, może powstać duplikat Customer'a.
  // UNIQUE index `uq_tenants_stripe_customer` chroni przed zapisaniem
  // duplicate'u, ale Customer w Stripe zostanie sierota — trzeba ręcznie
  // cleanup'ować. Akceptowalne ryzyko dla MVP (rzadkie race).
  const { error: updErr } = await supabase
    .from('tenants')
    .update({ stripe_customer_id: customer.id })
    .eq('id', input.tenantId);

  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { area: 'stripe.customer.create' },
      extra: { tenantId: input.tenantId, customerId: customer.id },
    });
    // Stripe Customer został utworzony ale persist failnął — wciąż zwracamy ID,
    // żeby caller mógł go użyć w tym requeście. Kolejne wywołanie zrobi insert.
    throw new Error(
      `Stripe customer created (${customer.id}) ale UPDATE tenant failnął: ${updErr.message}`,
    );
  }

  return { customerId: customer.id, created: true };
}
