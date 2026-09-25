import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStripe: vi.fn(),
  getActiveSubscription: vi.fn(),
  ensureStripeCustomer: vi.fn(),
  listSubscriptions: vi.fn(),
  retrieveSubscription: vi.fn(),
  listSessions: vi.fn(),
  retrieveSession: vi.fn(),
  createSession: vi.fn(),
  claim: vi.fn(),
  record: vi.fn(),
  hold: vi.fn(),
  abandon: vi.fn(),
  settle: vi.fn(),
  retire: vi.fn(),
  audit: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/stripe/client', () => ({ getStripe: mocks.getStripe }));
vi.mock('@/lib/stripe/subscription', () => ({
  getActiveSubscription: mocks.getActiveSubscription,
}));
vi.mock('@/lib/stripe/customer', () => ({
  ensureStripeCustomer: mocks.ensureStripeCustomer,
}));
vi.mock('@/lib/stripe/checkout-store', () => ({
  claimCheckoutAttempt: mocks.claim,
  recordCheckoutSession: mocks.record,
  holdCheckoutAttempt: mocks.hold,
  abandonCheckoutAttempt: mocks.abandon,
  settleCheckoutSession: mocks.settle,
  retireCompletedCheckoutAttempt: mocks.retire,
}));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.capture }));

import { createCheckoutSession, type CreateCheckoutInput } from '@/lib/stripe/checkout';

const tenantId = '11111111-1111-4111-8111-111111111111';
const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const nextAttemptId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const customerId = 'cus_TestA';
const sessionId = 'cs_TestA';
const subscriptionId = 'sub_TestA';

const input: CreateCheckoutInput = {
  tenantId,
  email: 'owner@example.test',
  plan: 'monthly',
  baseUrl: 'https://app.example.test',
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    url: 'https://checkout.stripe.test/cs_TestA',
    mode: 'subscription',
    status: 'open',
    customer: customerId,
    client_reference_id: attemptId,
    metadata: { tenantId, plan: 'monthly', attemptId },
    expires_at: 2_000_000_000,
    amount_total: 5900,
    currency: 'pln',
    subscription: null,
    ...overrides,
  };
}

function existingClaim(state: 'creating' | 'open' | 'uncertain' | 'held' | 'completed') {
  return {
    state,
    attemptId,
    customerId,
    priceId: 'price_monthly',
    plan: 'monthly',
    sessionId: state === 'creating' || state === 'uncertain' ? null : sessionId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_PRICE_MONTHLY', 'price_monthly');
  vi.stubEnv('STRIPE_PRICE_ANNUAL', 'price_annual');
  mocks.getStripe.mockReturnValue({
    subscriptions: {
      list: mocks.listSubscriptions,
      retrieve: mocks.retrieveSubscription,
    },
    checkout: { sessions: {
      list: mocks.listSessions,
      retrieve: mocks.retrieveSession,
      create: mocks.createSession,
    } },
  });
  mocks.getActiveSubscription.mockResolvedValue(null);
  mocks.ensureStripeCustomer.mockResolvedValue({ customerId, created: false });
  mocks.listSubscriptions.mockResolvedValue({ data: [], has_more: false });
  mocks.retrieveSubscription.mockResolvedValue({
    id: subscriptionId, customer: customerId, status: 'canceled',
  });
  mocks.listSessions.mockResolvedValue({ data: [], has_more: false });
  mocks.retrieveSession.mockResolvedValue(session());
  mocks.createSession.mockResolvedValue(session());
  mocks.claim.mockResolvedValue({ state: 'claimed', attemptId });
  mocks.record.mockResolvedValue(undefined);
  mocks.hold.mockResolvedValue(undefined);
  mocks.abandon.mockResolvedValue(undefined);
  mocks.settle.mockResolvedValue(undefined);
  mocks.retire.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Stripe Checkout durable claim', () => {
  it('blocks a local nonterminal subscription before Customer or claim', async () => {
    mocks.getActiveSubscription.mockResolvedValue({ status: 'trialing' });
    await expect(createCheckoutSession(input)).rejects.toThrow(
      'Tenant already has a nonterminal subscription',
    );
    expect(mocks.ensureStripeCustomer).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('validates plan configuration before Stripe or database side effects', async () => {
    vi.stubEnv('STRIPE_PRICE_MONTHLY', '');
    await expect(createCheckoutSession(input)).rejects.toThrow('must both be configured');
    expect(mocks.getStripe).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('claims before Stripe create, uses a random attempt key and records Session', async () => {
    await expect(createCheckoutSession(input)).resolves.toEqual({
      sessionId, url: 'https://checkout.stripe.test/cs_TestA',
    });
    expect(mocks.claim).toHaveBeenCalledWith(
      tenantId, customerId, 'price_monthly', 'monthly',
    );
    expect(mocks.createSession).toHaveBeenCalledOnce();
    const [params, options] = mocks.createSession.mock.calls[0];
    expect(params.client_reference_id).toBe(attemptId);
    expect(params.metadata.attemptId).toBe(attemptId);
    expect(options.idempotencyKey).toBe('faktflow-checkout-v2:' + attemptId);
    expect(options.idempotencyKey).not.toContain(tenantId);
    expect(mocks.record).toHaveBeenCalledWith(
      attemptId, sessionId, 2_000_000_000,
    );
    expect(mocks.listSessions).toHaveBeenCalledWith({
      customer: customerId, status: 'open', limit: 100,
    });
  });

  it('lets only the claim winner call Stripe for simultaneous requests', async () => {
    mocks.claim
      .mockResolvedValueOnce({ state: 'claimed', attemptId })
      .mockResolvedValueOnce(existingClaim('creating'));
    const results = await Promise.allSettled([
      createCheckoutSession(input), createCheckoutSession(input),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled', 'rejected',
    ]);
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });

  it('reuses the same open Session across an hour boundary without creating another', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1_799_999);
    mocks.claim
      .mockResolvedValueOnce({ state: 'claimed', attemptId })
      .mockResolvedValueOnce(existingClaim('open'));
    const first = await createCheckoutSession(input);
    now.mockReturnValueOnce(5_400_001);
    const second = await createCheckoutSession(input);
    expect(second).toEqual(first);
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(mocks.retrieveSession).toHaveBeenCalledWith(sessionId);
  });

  it('blocks a different plan while the earlier Session is open', async () => {
    mocks.claim.mockResolvedValue(existingClaim('open'));
    await expect(createCheckoutSession({ ...input, plan: 'annual' }))
      .rejects.toThrow('Another Checkout plan is already in progress');
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('honors the local subscription check repeated inside the atomic DB claim', async () => {
    mocks.claim.mockResolvedValueOnce({ state: 'subscription' });
    await expect(createCheckoutSession(input))
      .rejects.toThrow('Tenant already has a nonterminal subscription');
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.listSubscriptions).not.toHaveBeenCalled();
  });

  it('holds a provider response with an already expired Session', async () => {
    mocks.createSession.mockResolvedValueOnce(session({
      expires_at: Math.floor(Date.now() / 1000) - 1,
    }));
    await expect(createCheckoutSession(input))
      .rejects.toThrow('response is incomplete or mismatched');
    expect(mocks.hold).toHaveBeenCalledWith(attemptId, 'creating', 'uncertain');
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('marks an exact completed Session without creating another', async () => {
    mocks.claim.mockResolvedValueOnce(existingClaim('open'));
    mocks.retrieveSession.mockResolvedValueOnce(session({
      status: 'complete', subscription: subscriptionId,
    }));
    await expect(createCheckoutSession(input))
      .rejects.toThrow('subscription reconciliation required');
    expect(mocks.settle).toHaveBeenCalledWith(attemptId, sessionId, 'completed');
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it('holds an ambiguous provider create and never issues a second call', async () => {
    mocks.createSession.mockRejectedValueOnce(new Error('timeout'));
    mocks.claim
      .mockResolvedValueOnce({ state: 'claimed', attemptId })
      .mockResolvedValueOnce(existingClaim('uncertain'));
    await expect(createCheckoutSession(input)).rejects.toThrow('timeout');
    expect(mocks.hold).toHaveBeenCalledWith(attemptId, 'creating', 'uncertain');
    await expect(createCheckoutSession(input))
      .rejects.toThrow('requires manual reconciliation');
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });

  it('leaves a blocking claim when Session persistence is uncertain', async () => {
    mocks.record.mockRejectedValueOnce(new Error('database response lost'));
    await expect(createCheckoutSession(input)).rejects.toThrow('database response lost');
    expect(mocks.hold).toHaveBeenCalledWith(attemptId, 'creating', 'uncertain');
    expect(mocks.abandon).not.toHaveBeenCalled();
  });

  it('holds a legacy open Session instead of creating another', async () => {
    mocks.listSessions.mockResolvedValueOnce({
      data: [session({ client_reference_id: null })], has_more: false,
    });
    await expect(createCheckoutSession(input))
      .rejects.toThrow('requires reconciliation');
    expect(mocks.hold).toHaveBeenCalledWith(attemptId, 'creating', 'held');
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('fails closed on a paginated list of existing open Sessions', async () => {
    mocks.listSessions.mockResolvedValueOnce({ data: [], has_more: true });
    await expect(createCheckoutSession(input))
      .rejects.toThrow('requires reconciliation');
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('abandons only before provider create when Stripe already has a subscription', async () => {
    mocks.listSubscriptions.mockResolvedValueOnce({
      data: [{ status: 'incomplete' }], has_more: false,
    });
    await expect(createCheckoutSession(input))
      .rejects.toThrow('nonterminal subscription');
    expect(mocks.abandon).toHaveBeenCalledWith(attemptId);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('reclaims only after the exact existing Session is confirmed expired', async () => {
    mocks.claim
      .mockResolvedValueOnce(existingClaim('open'))
      .mockResolvedValueOnce({ state: 'claimed', attemptId: nextAttemptId });
    mocks.retrieveSession.mockResolvedValueOnce(session({ status: 'expired', url: null }));
    mocks.createSession.mockResolvedValueOnce(session({
      id: 'cs_TestB',
      url: 'https://checkout.stripe.test/cs_TestB',
      client_reference_id: nextAttemptId,
      metadata: { tenantId, plan: 'monthly', attemptId: nextAttemptId },
    }));
    await expect(createCheckoutSession(input)).resolves.toMatchObject({
      sessionId: 'cs_TestB',
    });
    expect(mocks.settle).toHaveBeenCalledWith(attemptId, sessionId, 'expired');
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(mocks.record).toHaveBeenCalledWith(
      nextAttemptId, 'cs_TestB', 2_000_000_000,
    );
  });

  it('never reclaims an open Session by local elapsed time', async () => {
    mocks.claim.mockResolvedValue(existingClaim('open'));
    mocks.retrieveSession.mockRejectedValueOnce(new Error('Stripe unavailable'));
    await expect(createCheckoutSession(input))
      .rejects.toThrow('Stripe unavailable');
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('holds a Session whose Stripe identity does not match the attempt', async () => {
    mocks.claim.mockResolvedValue(existingClaim('open'));
    mocks.retrieveSession.mockResolvedValueOnce(session({
      metadata: { tenantId: 'another-tenant', plan: 'monthly', attemptId },
    }));
    await expect(createCheckoutSession(input))
      .rejects.toThrow('identity mismatch');
    expect(mocks.hold).toHaveBeenCalledWith(attemptId, 'open', 'held');
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('retires completed attempt only after exact terminal Stripe and local confirmation', async () => {
    mocks.claim
      .mockResolvedValueOnce(existingClaim('completed'))
      .mockResolvedValueOnce({ state: 'claimed', attemptId: nextAttemptId });
    mocks.retrieveSession.mockResolvedValueOnce(session({
      status: 'complete', subscription: subscriptionId,
    }));
    mocks.createSession.mockResolvedValueOnce(session({
      id: 'cs_TestB',
      url: 'https://checkout.stripe.test/cs_TestB',
      client_reference_id: nextAttemptId,
      metadata: { tenantId, plan: 'monthly', attemptId: nextAttemptId },
    }));
    await expect(createCheckoutSession(input)).resolves.toMatchObject({
      sessionId: 'cs_TestB',
    });
    expect(mocks.retire).toHaveBeenCalledWith(
      attemptId, sessionId, subscriptionId,
    );
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });

  it('keeps completed hold when Stripe Subscription is still active', async () => {
    mocks.claim.mockResolvedValue(existingClaim('completed'));
    mocks.retrieveSession.mockResolvedValueOnce(session({
      status: 'complete', subscription: subscriptionId,
    }));
    mocks.retrieveSubscription.mockResolvedValueOnce({
      id: subscriptionId, customer: customerId, status: 'active',
    });
    await expect(createCheckoutSession(input))
      .rejects.toThrow('not terminal');
    expect(mocks.retire).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
