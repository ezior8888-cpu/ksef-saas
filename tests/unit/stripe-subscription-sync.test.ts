import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  retrieve: vi.fn(),
  resolveTenant: vi.fn(),
  mapSubscription: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ subscriptions: { retrieve: mocks.retrieve } }),
}));
vi.mock('@/lib/stripe/event-mapping', () => ({
  resolveTenantIdFromSubscription: mocks.resolveTenant,
  mapSubscriptionToRow: mocks.mapSubscription,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
}));

import { syncCurrentStripeSubscription } from '@/lib/stripe/subscription-sync';
import { RetryablePreEffectWebhookError } from '@/lib/stripe/webhook-errors';

const firstToken = '11111111-1111-4111-8111-111111111111';
const secondToken = '22222222-2222-4222-8222-222222222222';
const current = {
  id: 'sub_synced',
  status: 'active',
  customer: 'cus_synced',
  items: { data: [{ price: { id: 'price_monthly' } }] },
} as Stripe.Subscription;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.retrieve.mockResolvedValue(current);
  mocks.resolveTenant.mockResolvedValue('tenant-a');
  mocks.mapSubscription.mockImplementation((subscription: Stripe.Subscription, tenantId: string) => ({
    tenant_id: tenantId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: 'cus_synced',
    status: subscription.status,
    plan: 'monthly',
  }));
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'claim_stripe_subscription_sync') {
      return { data: [{ claimed: true, claim_token: firstToken, fence: 1 }], error: null };
    }
    if (name === 'apply_stripe_subscription_sync') return { data: true, error: null };
    if (name === 'release_stripe_subscription_sync') return { data: true, error: null };
    throw new Error('Unexpected RPC: ' + name);
  });
});

describe('Stripe subscription synchronization', () => {
  it('fetches and applies the current Stripe state using the claimed fence', async () => {
    const result = await syncCurrentStripeSubscription(current.id);

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'claim_stripe_subscription_sync', {
      p_subscription_id: current.id,
    });
    expect(mocks.retrieve).toHaveBeenCalledExactlyOnceWith(current.id);
    expect(mocks.resolveTenant).toHaveBeenCalledExactlyOnceWith(current);
    expect(mocks.mapSubscription).toHaveBeenCalledExactlyOnceWith(current, 'tenant-a');
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'apply_stripe_subscription_sync', {
      p_subscription_id: current.id,
      p_claim_token: firstToken,
      p_fence: 1,
      p_snapshot: expect.objectContaining({
        tenant_id: 'tenant-a',
        stripe_subscription_id: current.id,
        status: 'active',
      }),
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      subscription: current,
      tenantId: 'tenant-a',
      status: 'active',
    });
  });

  it('does not fetch or write when another worker owns the lease', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ claimed: false, claim_token: null, fence: null }],
      error: null,
    });

    await expect(syncCurrentStripeSubscription(current.id)).rejects.toMatchObject({
      name: 'RetryablePreEffectWebhookError',
      code: 'subscription_sync_busy',
    });
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.resolveTenant).not.toHaveBeenCalled();
    expect(mocks.mapSubscription).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it('rejects an invalid ID without acquiring a lease', async () => {
    await expect(syncCurrentStripeSubscription('cus_not_a_subscription')).rejects
      .toBeInstanceOf(RetryablePreEffectWebhookError);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it('releases the lease after a Stripe lookup failure so a later delivery can retry', async () => {
    mocks.retrieve.mockRejectedValue(new Error('Stripe temporarily unavailable'));

    await expect(syncCurrentStripeSubscription(current.id)).rejects.toMatchObject({
      name: 'RetryablePreEffectWebhookError',
      code: 'subscription_sync_lookup_failed',
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'release_stripe_subscription_sync', {
      p_subscription_id: current.id,
      p_claim_token: firstToken,
      p_fence: 1,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'apply_stripe_subscription_sync',
      expect.anything(),
    );
  });

  it('releases the lease when tenant resolution fails before a business write', async () => {
    mocks.resolveTenant.mockRejectedValue(new RetryablePreEffectWebhookError(
      'tenant_id_missing', 'tenant not resolved',
    ));

    await expect(syncCurrentStripeSubscription(current.id)).rejects.toMatchObject({
      name: 'RetryablePreEffectWebhookError',
      code: 'tenant_id_missing',
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'release_stripe_subscription_sync', {
      p_subscription_id: current.id,
      p_claim_token: firstToken,
      p_fence: 1,
    });
    expect(mocks.mapSubscription).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant mapped snapshot and releases the lease before apply', async () => {
    mocks.mapSubscription.mockReturnValue({
      tenant_id: 'tenant-b',
      stripe_subscription_id: current.id,
      status: 'active',
    });

    await expect(syncCurrentStripeSubscription(current.id)).rejects.toMatchObject({
      name: 'RetryablePreEffectWebhookError',
      code: 'subscription_sync_invalid',
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'release_stripe_subscription_sync', {
      p_subscription_id: current.id,
      p_claim_token: firstToken,
      p_fence: 1,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'apply_stripe_subscription_sync',
      expect.anything(),
    );
  });

  it('preserves a retryable lookup failure if releasing the lease also fails', async () => {
    mocks.retrieve.mockRejectedValue(new Error('Stripe temporarily unavailable'));
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_stripe_subscription_sync') {
        return { data: [{ claimed: true, claim_token: firstToken, fence: 1 }], error: null };
      }
      if (name === 'release_stripe_subscription_sync') {
        return { data: false, error: { message: 'database timeout' } };
      }
      throw new Error('Unexpected RPC: ' + name);
    });

    await expect(syncCurrentStripeSubscription(current.id)).rejects.toMatchObject({
      name: 'RetryablePreEffectWebhookError',
      code: 'subscription_sync_lookup_failed',
    });
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });
  it('does not release a lease after an uncertain apply response', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_stripe_subscription_sync') {
        return { data: [{ claimed: true, claim_token: firstToken, fence: 1 }], error: null };
      }
      if (name === 'apply_stripe_subscription_sync') {
        return { data: null, error: { message: 'connection lost after commit' } };
      }
      throw new Error('Unexpected RPC: ' + name);
    });

    await expect(syncCurrentStripeSubscription(current.id))
      .rejects.toThrow('Subscription sync apply failed');
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'release_stripe_subscription_sync',
      expect.anything(),
    );
  });

  it('fences an expired first lease whose slower Stripe response arrives after the new snapshot', async () => {
    const staleLookup = deferred<Stripe.Subscription>();
    const stale = { ...current, status: 'past_due' } as Stripe.Subscription;
    const fresh = { ...current, status: 'active' } as Stripe.Subscription;
    let claimNumber = 0;
    mocks.retrieve.mockImplementationOnce(() => staleLookup.promise).mockResolvedValueOnce(fresh);
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_stripe_subscription_sync') {
        claimNumber += 1;
        return {
          data: [{
            claimed: true,
            claim_token: claimNumber === 1 ? firstToken : secondToken,
            fence: claimNumber,
          }],
          error: null,
        };
      }
      if (name === 'apply_stripe_subscription_sync') {
        return { data: args.p_fence === 2, error: null };
      }
      throw new Error('Unexpected RPC: ' + name);
    });

    const first = syncCurrentStripeSubscription(current.id);
    await vi.waitFor(() => expect(mocks.retrieve).toHaveBeenCalledTimes(1));
    const secondResult = await syncCurrentStripeSubscription(current.id);
    staleLookup.resolve(stale);
    await expect(first).rejects.toThrow('Subscription sync apply was not confirmed');

    expect(secondResult.status).toBe('active');
    const applies = mocks.rpc.mock.calls.filter(([name]) => name === 'apply_stripe_subscription_sync');
    expect(applies.map(([, args]) => args.p_fence)).toEqual([2, 1]);
    expect(applies.map(([, args]) => args.p_snapshot.status)).toEqual(['active', 'past_due']);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'release_stripe_subscription_sync',
      expect.anything(),
    );
  });

  it('rejects a malformed claim instead of fetching or applying a subscription', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ claimed: true, claim_token: 'not-a-token', fence: 0 }],
      error: null,
    });

    await expect(syncCurrentStripeSubscription(current.id))
      .rejects.toThrow('Unexpected subscription sync claim response');
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.mapSubscription).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
});