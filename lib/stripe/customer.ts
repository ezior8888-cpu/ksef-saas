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

async function verifyStripeCustomerTenant(
  customerId: string,
  tenantId: string,
): Promise<void> {
  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await getStripe().customers.retrieve(customerId);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: 'stripe.customer.verify' },
      extra: { tenantId, customerId },
    });
    throw new Error('Stripe customer verification failed');
  }

  // A stale or manually edited DB reference must not open another tenant's
  // billing portal. Legacy customers without tenantId require manual review.
  if (customer.deleted || customer.metadata?.tenantId !== tenantId) {
    Sentry.captureMessage('Stripe customer tenant binding mismatch', {
      level: 'error',
      extra: { tenantId, customerId },
    });
    throw new Error('Stripe customer tenant binding requires manual reconciliation');
  }
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
  if (!tenant) {
    throw new Error('tenant not found for Stripe customer');
  }
  if (tenant.stripe_customer_id) {
    await verifyStripeCustomerTenant(tenant.stripe_customer_id, input.tenantId);
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

  // Claim the tenant mapping only if it is still empty. Two requests can both
  // create a Stripe Customer, but only the DB winner may use its own ID.
  const { data: assigned, error: updErr } = await supabase
    .from('tenants')
    .update({ stripe_customer_id: customer.id })
    .eq('id', input.tenantId)
    .is('stripe_customer_id', null)
    .select('stripe_customer_id')
    .maybeSingle();

  if (!updErr && assigned?.stripe_customer_id === customer.id) {
    await verifyStripeCustomerTenant(customer.id, input.tenantId);
    return { customerId: customer.id, created: true };
  }

  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { area: 'stripe.customer.create' },
      extra: { tenantId: input.tenantId, customerId: customer.id },
    });
  }

  // A lost CAS or an ambiguous DB response must never return the newly created
  // ID unless a fresh read confirms that it is actually assigned to this tenant.
  const { data: current, error: rereadErr } = await supabase
    .from('tenants')
    .select('stripe_customer_id')
    .eq('id', input.tenantId)
    .maybeSingle();

  if (rereadErr) {
    throw new Error('Stripe customer assignment could not be verified');
  }
  if (current?.stripe_customer_id) {
    await verifyStripeCustomerTenant(current.stripe_customer_id, input.tenantId);
    return {
      customerId: current.stripe_customer_id,
      created: current.stripe_customer_id === customer.id,
    };
  }

  throw new Error('Stripe customer is not assigned to tenant');
}
