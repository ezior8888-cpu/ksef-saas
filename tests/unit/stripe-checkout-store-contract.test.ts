import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

import { recordVerifiedUncertainCheckoutSession } from '@/lib/stripe/checkout-store';

const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tenantId = '11111111-1111-4111-8111-111111111111';
const customerId = 'cus_TestA';
const sessionId = 'cs_test_TestA';
const expiresAt = 2_000_000_000;

beforeEach(() => { mocks.rpc.mockReset(); });

describe('verified uncertain Checkout recovery RPC contract', () => {
  it('sends the exact stored identity expected by the SQL compare-and-swap', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await recordVerifiedUncertainCheckoutSession(
      attemptId, tenantId, customerId, 'monthly', sessionId, expiresAt,
    );
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      'record_verified_uncertain_checkout_session', {
        p_attempt_id: attemptId,
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_plan: 'monthly',
        p_session_id: sessionId,
        p_expires_at: new Date(expiresAt * 1000).toISOString(),
      },
    );
  });

  it.each([false, null])('keeps the claim blocked when SQL returns %j', async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(recordVerifiedUncertainCheckoutSession(
      attemptId, tenantId, customerId, 'monthly', sessionId, expiresAt,
    )).rejects.toThrow('not confirmed');
  });

  it('rejects invalid identity before invoking the RPC', async () => {
    await expect(recordVerifiedUncertainCheckoutSession(
      attemptId, tenantId, customerId, 'monthly', 'cs_bad-id', expiresAt,
    )).rejects.toThrow('Invalid verified Checkout Session record');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
