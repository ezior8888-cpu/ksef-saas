/** Durable per-tenant Stripe Customer claim. Migration 00083 supplies RPCs. */
import { createAdminClient } from '@/lib/supabase/admin';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER_PATTERN = /^cus_[A-Za-z0-9]+$/;

export type CustomerClaim =
  | { state: 'existing'; customerId: string }
  | { state: 'claimed'; attemptId: string }
  | { state: 'creating' | 'uncertain' | 'completed'; attemptId: string };

function parseClaim(value: unknown): CustomerClaim {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unexpected Customer claim response');
  }
  const row = value as Record<string, unknown>;
  if (row.state === 'existing') {
    if (typeof row.customerId !== 'string' ||
        !CUSTOMER_PATTERN.test(row.customerId) ||
        row.customerId.length > 255) {
      throw new Error('Unexpected Customer claim identity');
    }
    return { state: 'existing', customerId: row.customerId };
  }
  if (row.state === 'claimed' || row.state === 'creating' ||
      row.state === 'uncertain' || row.state === 'completed') {
    if (typeof row.attemptId !== 'string' ||
        !UUID_PATTERN.test(row.attemptId)) {
      throw new Error('Unexpected Customer claim attempt ID');
    }
    return { state: row.state, attemptId: row.attemptId };
  }
  throw new Error('Unexpected Customer claim state');
}

export async function claimCustomerAttempt(tenantId: string): Promise<CustomerClaim> {
  const { data, error } = await createAdminClient().rpc(
    'claim_stripe_customer_attempt', { p_tenant_id: tenantId },
  );
  if (error) throw new Error('Stripe Customer claim failed');
  return parseClaim(data);
}

export async function recordCustomerAttempt(
  tenantId: string,
  attemptId: string,
  customerId: string,
): Promise<void> {
  if (!UUID_PATTERN.test(attemptId) ||
      !CUSTOMER_PATTERN.test(customerId) || customerId.length > 255) {
    throw new Error('Invalid Stripe Customer assignment');
  }
  const { data, error } = await createAdminClient().rpc(
    'record_stripe_customer_attempt',
    {
      p_tenant_id: tenantId,
      p_attempt_id: attemptId,
      p_customer_id: customerId,
    },
  );
  if (error || data !== true) {
    throw new Error('Stripe Customer assignment was not confirmed');
  }
}

export async function holdCustomerAttempt(
  tenantId: string,
  attemptId: string,
  customerId: string | null,
): Promise<void> {
  if (!UUID_PATTERN.test(attemptId) ||
      (customerId !== null &&
        (!CUSTOMER_PATTERN.test(customerId) || customerId.length > 255))) {
    throw new Error('Invalid Stripe Customer hold');
  }
  const { data, error } = await createAdminClient().rpc(
    'hold_stripe_customer_attempt',
    {
      p_tenant_id: tenantId,
      p_attempt_id: attemptId,
      p_customer_id: customerId,
    },
  );
  if (error || data !== true) {
    throw new Error('Stripe Customer hold was not confirmed');
  }
}
