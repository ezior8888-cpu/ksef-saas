/**
 * Stripe Customer lifecycle. A durable database claim is acquired before
 * customers.create; an ambiguous provider result cannot create another
 * Customer on a later request.
 */
import * as Sentry from '@sentry/nextjs';
import type Stripe from 'stripe';

import { getStripe } from './client';
import {
  claimCustomerAttempt,
  holdCustomerAttempt,
  recordCustomerAttempt,
} from './customer-store';

export interface EnsureCustomerInput {
  tenantId: string;
  /** Owner email — primary contact in Stripe. */
  email: string;
  /** Company name from tenants.name. */
  name?: string;
  nip?: string;
}

const CUSTOMER_PATTERN = /^cus_[A-Za-z0-9]+$/;

async function verifyStripeCustomerTenant(
  customerId: string,
  tenantId: string,
): Promise<void> {
  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await getStripe().customers.retrieve(customerId);
  } catch {
    Sentry.captureMessage('Stripe Customer verification unavailable', {
      level: 'error',
      tags: { area: 'stripe.customer.verify' },
      extra: { tenantId, customerId },
    });
    throw new Error('Stripe customer verification failed');
  }

  // A stale or manually edited DB reference must not open another tenant's
  // billing portal. Legacy customers without tenantId require manual review.
  if (customer.deleted || customer.id !== customerId ||
      customer.metadata?.tenantId !== tenantId) {
    Sentry.captureMessage('Stripe customer tenant binding mismatch', {
      level: 'error',
      extra: { tenantId, customerId },
    });
    throw new Error('Stripe customer tenant binding requires manual reconciliation');
  }
}

async function holdUncertain(
  tenantId: string,
  attemptId: string,
  customerId: string | null,
): Promise<void> {
  try {
    await holdCustomerAttempt(tenantId, attemptId, customerId);
  } catch {
    // A lost hold response is still safe: the creating claim remains blocking,
    // or the record transaction has already completed.
    Sentry.captureMessage('Stripe Customer hold could not be confirmed', {
      level: 'error',
      tags: { area: 'stripe.customer.hold' },
      extra: { tenantId, attemptId, customerId },
    });
  }
}

export async function ensureStripeCustomer(
  input: EnsureCustomerInput,
): Promise<{ customerId: string; created: boolean }> {
  // Fail before claiming if Stripe is not configured; no provider side effect.
  const stripe = getStripe();
  const claim = await claimCustomerAttempt(input.tenantId);

  if (claim.state === 'existing') {
    await verifyStripeCustomerTenant(claim.customerId, input.tenantId);
    return { customerId: claim.customerId, created: false };
  }
  if (claim.state !== 'claimed') {
    throw new Error('Stripe Customer creation requires manual reconciliation');
  }

  let customerId: string | null = null;
  try {
    const customer: Stripe.Customer = await stripe.customers.create({
      email: input.email,
      name: input.name,
      description: input.nip ? `NIP ${input.nip}` : undefined,
      metadata: {
        tenantId: input.tenantId,
        customerAttemptId: claim.attemptId,
        ...(input.nip ? { nip: input.nip } : {}),
      },
      ...(input.nip
        ? { tax_id_data: [{ type: 'eu_vat', value: `PL${input.nip}` }] }
        : {}),
    }, {
      // A random durable claim ID, without company or personal data.
      idempotencyKey: 'faktflow-customer-v1:' + claim.attemptId,
    });
    if (!CUSTOMER_PATTERN.test(customer.id) || customer.id.length > 255) {
      throw new Error('Unexpected Stripe Customer identity');
    }
    customerId = customer.id;
    await verifyStripeCustomerTenant(customerId, input.tenantId);
  } catch {
    await holdUncertain(input.tenantId, claim.attemptId, customerId);
    Sentry.captureMessage('Stripe Customer create outcome requires reconciliation', {
      level: 'error',
      tags: { area: 'stripe.customer.create' },
      extra: { tenantId: input.tenantId, attemptId: claim.attemptId, customerId },
    });
    throw new Error('Stripe Customer creation requires manual reconciliation');
  }

  try {
    await recordCustomerAttempt(input.tenantId, claim.attemptId, customerId);
    return { customerId, created: true };
  } catch {
    // The RPC may have committed while its response was lost. A fresh claim
    // read is authoritative. Never return an unassigned provider Customer.
    try {
      const current = await claimCustomerAttempt(input.tenantId);
      if (current.state === 'existing' && current.customerId === customerId) {
        return { customerId, created: true };
      }
    } catch {
      // Keep the original fail-closed outcome below.
    }
    await holdUncertain(input.tenantId, claim.attemptId, customerId);
    Sentry.captureMessage('Stripe Customer assignment requires reconciliation', {
      level: 'error',
      tags: { area: 'stripe.customer.record' },
      extra: { tenantId: input.tenantId, attemptId: claim.attemptId, customerId },
    });
    throw new Error('Stripe Customer assignment could not be verified');
  }
}
