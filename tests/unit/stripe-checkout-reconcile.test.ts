import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  retrieve: vi.fn(),
  settle: vi.fn(),
  record: vi.fn(),
  recordVerified: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: mocks.retrieve } } }),
}));
vi.mock('@/lib/stripe/checkout-store', () => ({
  settleCheckoutSession: mocks.settle,
  recordCheckoutSession: mocks.record,
  recordVerifiedUncertainCheckoutSession: mocks.recordVerified,
}));

import { RetryablePreEffectWebhookError } from '@/lib/stripe/webhook-errors';

import {
  handleCheckoutSessionStateEvent,
  reconcileExpiredOpenCheckoutAttempts,
  reconcileOpenCheckoutAttempt,
} from '@/lib/stripe/checkout-reconcile';

const attempt = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenant_id: '11111111-1111-4111-8111-111111111111',
  stripe_customer_id: 'cus_TestA',
  plan: 'monthly' as const,
  stripe_session_id: 'cs_test_TestA',
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: attempt.stripe_session_id,
    customer: attempt.stripe_customer_id,
    mode: 'subscription',
    client_reference_id: attempt.id,
    metadata: {
      attemptId: attempt.id,
      tenantId: attempt.tenant_id,
      plan: attempt.plan,
    },
    status: 'complete',
    subscription: 'sub_TestA',
    ...overrides,
  };
}

function attemptLookup(data: Record<string, unknown> | null, error: Error | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  mocks.from.mockReturnValue({ select });
  return { select, eq };
}

function expiredLookup(data: Array<Record<string, unknown>> | null, error: Error | null = null) {
  const limit = vi.fn().mockResolvedValue({ data, error });
  const order = vi.fn(() => ({ limit }));
  const lt = vi.fn(() => ({ order }));
  const eq = vi.fn(() => ({ lt }));
  const select = vi.fn(() => ({ eq }));
  mocks.from.mockReturnValue({ select });
  return { eq, lt, order, limit };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.retrieve.mockResolvedValue(session());
  mocks.settle.mockResolvedValue(undefined);
  mocks.record.mockResolvedValue(undefined);
  mocks.recordVerified.mockResolvedValue(undefined);
});

describe('Checkout claim reconciliation', () => {
  it('settles a matching live completed Session on a signed event', async () => {
    const lookup = attemptLookup({ ...attempt, status: 'open' });
    await handleCheckoutSessionStateEvent(
      session({ status: 'complete' }) as unknown as Stripe.Checkout.Session,
    );
    expect(lookup.eq).toHaveBeenCalledWith('id', attempt.id);
    expect(mocks.retrieve).toHaveBeenCalledWith(attempt.stripe_session_id, {}, {
      timeout: 5_000, maxNetworkRetries: 0,
    });
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
      attempt.id, attempt.stripe_session_id, 'completed',
    );
  });

  it('settles a provider-confirmed expired Session', async () => {
    mocks.retrieve.mockResolvedValue(session({ status: 'expired' }));
    await expect(reconcileOpenCheckoutAttempt(attempt)).resolves.toBe('expired');
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
      attempt.id, attempt.stripe_session_id, 'expired',
    );
  });

  it('keeps a complete Session open if its Subscription ID is unavailable', async () => {
    mocks.retrieve.mockResolvedValue(session({ subscription: null }));
    await expect(reconcileOpenCheckoutAttempt(attempt))
      .rejects.toThrow('has no Subscription ID');
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('does not settle from a stale signed snapshot if Stripe currently says open', async () => {
    attemptLookup({ ...attempt, status: 'open' });
    mocks.retrieve.mockResolvedValue(session({ status: 'open' }));
    await handleCheckoutSessionStateEvent(
      session({ status: 'complete' }) as unknown as Stripe.Checkout.Session,
    );
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it.each([
    ['customer', { customer: 'cus_Elsewhere' }],
    ['tenant', { metadata: { attemptId: attempt.id, tenantId: 'other', plan: 'monthly' } }],
    ['attempt', { client_reference_id: 'another-attempt' }],
  ])('does not settle a mismatched %s', async (_label, override) => {
    mocks.retrieve.mockResolvedValue(session(override));
    await expect(reconcileOpenCheckoutAttempt(attempt))
      .rejects.toThrow('identity mismatch');
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('does not attach an unknown Session by guesswork', async () => {
    attemptLookup(null);
    await expect(handleCheckoutSessionStateEvent(
      session() as unknown as Stripe.Checkout.Session,
    )).rejects.toThrow('no matching attempt');
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('rejects a legacy Session without a durable attempt reference', async () => {
    mocks.retrieve.mockResolvedValue(session({ client_reference_id: null }));
    await expect(handleCheckoutSessionStateEvent(
      session() as unknown as Stripe.Checkout.Session,
    )).rejects.toThrow('no valid attempt reference');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('rejects a provider response with a different Session ID than the signed event', async () => {
    mocks.retrieve.mockResolvedValue(session({ id: 'cs_test_Other' }));
    await expect(handleCheckoutSessionStateEvent(
      session() as unknown as Stripe.Checkout.Session,
    )).rejects.toThrow('retrieval ID mismatch');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('accepts a lost record response only after the exact open row is reread', async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({
        data: { ...attempt, status: 'creating', stripe_session_id: null },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ...attempt, status: 'open' }, error: null,
      });
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    mocks.retrieve.mockResolvedValue(session({ expires_at: 2_000_000_000 }));
    mocks.record.mockRejectedValueOnce(new Error('database response lost'));
    await handleCheckoutSessionStateEvent(
      session() as unknown as Stripe.Checkout.Session,
    );
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
      attempt.id, attempt.stripe_session_id, 'completed',
    );
  });

  it('records an exact Session when the signed event beats the record RPC', async () => {
    attemptLookup({ ...attempt, status: 'creating', stripe_session_id: null });
    mocks.retrieve.mockResolvedValue(session({ expires_at: 2_000_000_000 }));
    await handleCheckoutSessionStateEvent(session() as unknown as Stripe.Checkout.Session);
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith(
      attempt.id, attempt.stripe_session_id, 2_000_000_000,
    );
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
      attempt.id, attempt.stripe_session_id, 'completed',
    );
  });

  it('recovers a lost record response from an uncertain row only with an exact signed and freshly fetched Session', async () => {
    attemptLookup({ ...attempt, status: 'uncertain', stripe_session_id: null });
    mocks.retrieve.mockResolvedValue(session({ expires_at: 2_000_000_000 }));
    await handleCheckoutSessionStateEvent(session() as unknown as Stripe.Checkout.Session);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.recordVerified).toHaveBeenCalledExactlyOnceWith(
      attempt.id, attempt.tenant_id, attempt.stripe_customer_id,
      attempt.plan, attempt.stripe_session_id, 2_000_000_000,
    );
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
      attempt.id, attempt.stripe_session_id, 'completed',
    );
  });

  it('accepts a lost uncertain recovery response only after rereading the exact open row', async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({
        data: { ...attempt, status: 'uncertain', stripe_session_id: null }, error: null,
      })
      .mockResolvedValueOnce({ data: { ...attempt, status: 'open' }, error: null });
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    mocks.retrieve.mockResolvedValue(session({ expires_at: 2_000_000_000 }));
    mocks.recordVerified.mockRejectedValueOnce(new Error('lost COMMIT response'));
    await handleCheckoutSessionStateEvent(session() as unknown as Stripe.Checkout.Session);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
      attempt.id, attempt.stripe_session_id, 'completed',
    );
  });

  it.each([
    ['customer', { customer: 'cus_Wrong' }],
    ['tenant', { metadata: { attemptId: attempt.id, tenantId: 'other', plan: 'monthly' } }],
    ['plan', { metadata: { attemptId: attempt.id, tenantId: attempt.tenant_id, plan: 'annual' } }],
  ])('keeps uncertain blocked for a mismatched %s', async (_label, override) => {
    attemptLookup({ ...attempt, status: 'uncertain', stripe_session_id: null });
    mocks.retrieve.mockResolvedValue(session({ expires_at: 2_000_000_000, ...override }));
    await expect(handleCheckoutSessionStateEvent(session() as unknown as Stripe.Checkout.Session))
      .rejects.toThrow('identity mismatch');
    expect(mocks.recordVerified).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it.each(['completed', 'expired', 'retired'])(
    'rejects another signed Session for a terminal %s attempt', async (status) => {
      const otherSessionId = 'cs_test_Other';
      attemptLookup({ ...attempt, status });
      mocks.retrieve.mockResolvedValue(session({
        id: otherSessionId, status: status === 'expired' ? 'expired' : 'complete',
      }));
      await expect(handleCheckoutSessionStateEvent(
        session({ id: otherSessionId }) as unknown as Stripe.Checkout.Session,
      )).rejects.toThrow('Terminal Checkout attempt Session ID mismatch');
      expect(mocks.record).not.toHaveBeenCalled();
      expect(mocks.recordVerified).not.toHaveBeenCalled();
      expect(mocks.settle).not.toHaveBeenCalled();
    },
  );

  it('marks only a failed provider read before writes as safe for webhook retry', async () => {
    mocks.retrieve.mockRejectedValueOnce(new Error('timeout'));
    await expect(handleCheckoutSessionStateEvent(session() as unknown as Stripe.Checkout.Session))
      .rejects.toMatchObject({
        code: 'checkout_session_lookup_failed',
        name: 'RetryablePreEffectWebhookError',
      });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.recordVerified).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('marks only an initial database lookup failure as safe for webhook retry', async () => {
    attemptLookup(null, new Error('timeout'));
    await expect(handleCheckoutSessionStateEvent(session() as unknown as Stripe.Checkout.Session))
      .rejects.toMatchObject({
        code: 'checkout_attempt_lookup_failed',
        name: 'RetryablePreEffectWebhookError',
      });
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.recordVerified).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('marks a thrown initial database lookup as retryable before any write', async () => {
    const maybeSingle = vi.fn().mockRejectedValueOnce(new Error('timeout'));
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    await expect(handleCheckoutSessionStateEvent(session() as unknown as Stripe.Checkout.Session))
      .rejects.toMatchObject({ code: 'checkout_attempt_lookup_failed' });
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.recordVerified).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('does not classify a failed reread after an uncertain RPC as retryable', async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({
        data: { ...attempt, status: 'uncertain', stripe_session_id: null }, error: null,
      })
      .mockRejectedValueOnce(new Error('timeout after write'));
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    mocks.retrieve.mockResolvedValue(session({ expires_at: 2_000_000_000 }));
    mocks.recordVerified.mockRejectedValueOnce(new Error('lost COMMIT response'));
    const error = await handleCheckoutSessionStateEvent(
      session() as unknown as Stripe.Checkout.Session,
    ).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RetryablePreEffectWebhookError);
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('acknowledges an exact terminal Session without repeating the settlement', async () => {
    attemptLookup({ ...attempt, status: 'completed' });
    await handleCheckoutSessionStateEvent(session() as unknown as Stripe.Checkout.Session);
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.recordVerified).not.toHaveBeenCalled();
  });

  it('does not label an ambiguous recovery RPC response as safely retryable', async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({
        data: { ...attempt, status: 'uncertain', stripe_session_id: null }, error: null,
      })
      .mockResolvedValueOnce({
        data: { ...attempt, status: 'uncertain', stripe_session_id: null }, error: null,
      });
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    mocks.retrieve.mockResolvedValue(session({ expires_at: 2_000_000_000 }));
    mocks.recordVerified.mockRejectedValueOnce(new Error('lost response'));
    const error = await handleCheckoutSessionStateEvent(
      session() as unknown as Stripe.Checkout.Session,
    ).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RetryablePreEffectWebhookError);
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('verifies expired open claims with Stripe before the monitor counts them', async () => {
    const lookup = expiredLookup([attempt]);
    await reconcileExpiredOpenCheckoutAttempts('2026-09-25T11:45:00.000Z');
    expect(lookup.eq).toHaveBeenCalledWith('status', 'open');
    expect(lookup.lt).toHaveBeenCalledWith(
      'session_expires_at', '2026-09-25T11:45:00.000Z',
    );
    expect(lookup.limit).toHaveBeenCalledWith(50);
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
      attempt.id, attempt.stripe_session_id, 'completed',
    );
  });

  it('keeps mismatched claims unresolved and visible to the alert', async () => {
    expiredLookup([attempt]);
    mocks.retrieve.mockResolvedValue(session({ customer: 'cus_Wrong' }));
    await reconcileExpiredOpenCheckoutAttempts('2026-09-25T11:45:00.000Z');
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it('fails a lookup instead of reporting missing rows as healthy', async () => {
    expiredLookup(null, new Error('database unavailable'));
    await expect(reconcileExpiredOpenCheckoutAttempts('2026-09-25T11:45:00.000Z'))
      .rejects.toThrow('Expired Checkout attempts lookup failed');
  });

  it('does not acknowledge a failed database lookup as healthy', async () => {
    attemptLookup(null, new Error('database unavailable'));
    await expect(handleCheckoutSessionStateEvent(
      session() as unknown as Stripe.Checkout.Session,
    )).rejects.toThrow('Checkout attempt lookup failed');
    expect(mocks.settle).not.toHaveBeenCalled();
  });
});
