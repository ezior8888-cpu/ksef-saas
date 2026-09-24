import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStripe: vi.fn(),
  getActiveSubscription: vi.fn(),
  ensureStripeCustomer: vi.fn(),
  listSubscriptions: vi.fn(),
  createSession: vi.fn(),
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
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.capture,
}));

import { createCheckoutSession, type CreateCheckoutInput } from '@/lib/stripe/checkout';

const input: CreateCheckoutInput = {
  tenantId: 'tenant-1',
  email: 'owner@example.test',
  plan: 'monthly',
  baseUrl: 'https://app.example.test',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_PRICE_MONTHLY', 'price_monthly');
  vi.stubEnv('STRIPE_PRICE_ANNUAL', 'price_annual');
  mocks.getStripe.mockReturnValue({
    subscriptions: { list: mocks.listSubscriptions },
    checkout: { sessions: { create: mocks.createSession } },
  });
  mocks.getActiveSubscription.mockResolvedValue(null);
  mocks.ensureStripeCustomer.mockResolvedValue({ customerId: 'cus_tenant_1', created: false });
  mocks.listSubscriptions.mockResolvedValue({ data: [], has_more: false });
  mocks.createSession.mockResolvedValue({
    id: 'cs_checkout_1',
    url: 'https://checkout.stripe.test/cs_checkout_1',
    amount_total: 5900,
    currency: 'pln',
  });
  mocks.audit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Stripe Checkout guard', () => {
  it.each(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'])(
    'blocks another Checkout when the local subscription is %s',
    async (status) => {
      mocks.getActiveSubscription.mockResolvedValue({ status });

      await expect(createCheckoutSession(input)).rejects.toThrow(
        'Tenant already has a nonterminal subscription',
      );
      expect(mocks.ensureStripeCustomer).not.toHaveBeenCalled();
      expect(mocks.createSession).not.toHaveBeenCalled();
    },
  );

  it.each(['active', 'trialing', 'past_due', 'incomplete', 'paused'])(
    'blocks another Checkout when Stripe already has a %s subscription',
    async (status) => {
      mocks.listSubscriptions.mockResolvedValue({
        data: [{ status }],
        has_more: false,
      });

      await expect(createCheckoutSession(input)).rejects.toThrow(
        'Stripe customer already has a nonterminal subscription',
      );
      expect(mocks.createSession).not.toHaveBeenCalled();
    },
  );

  it('fails closed if the Stripe subscription listing is incomplete', async () => {
    mocks.listSubscriptions.mockResolvedValue({ data: [], has_more: true });
    await expect(createCheckoutSession(input)).rejects.toThrow(
      'Stripe customer already has a nonterminal subscription',
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('allows a new Checkout after canceled or expired subscriptions', async () => {
    mocks.listSubscriptions.mockResolvedValue({
      data: [{ status: 'canceled' }, { status: 'incomplete_expired' }],
      has_more: false,
    });

    await expect(createCheckoutSession(input)).resolves.toEqual({
      sessionId: 'cs_checkout_1',
      url: 'https://checkout.stripe.test/cs_checkout_1',
    });
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });

  it('does not create a Customer or Session for missing or colliding Price IDs', async () => {
    vi.stubEnv('STRIPE_PRICE_MONTHLY', '');
    await expect(createCheckoutSession(input)).rejects.toThrow('must both be configured');
    vi.stubEnv('STRIPE_PRICE_MONTHLY', 'price_annual');
    await expect(createCheckoutSession(input)).rejects.toThrow('must be distinct');
    expect(mocks.getStripe).not.toHaveBeenCalled();
    expect(mocks.ensureStripeCustomer).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('rejects an invalid runtime plan before any Stripe side effect', async () => {
    const invalid = { ...input, plan: 'premium' } as unknown as CreateCheckoutInput;
    await expect(createCheckoutSession(invalid)).rejects.toThrow('Invalid Stripe checkout plan');
    expect(mocks.ensureStripeCustomer).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('passes one idempotency key for two simultaneous same-tenant requests', async () => {
    const [first, second] = await Promise.all([
      createCheckoutSession(input),
      createCheckoutSession(input),
    ]);

    expect(first).toEqual(second);
    expect(mocks.createSession).toHaveBeenCalledTimes(2);
    const firstCall = mocks.createSession.mock.calls[0];
    const secondCall = mocks.createSession.mock.calls[1];
    expect(firstCall[0]).toEqual(secondCall[0]);
    expect(firstCall[1]?.idempotencyKey).toEqual(secondCall[1]?.idempotencyKey);
    expect(firstCall[1]?.idempotencyKey).toContain('tenant-1');
  });

  it('reuses the tenant idempotency key across plans so Stripe rejects conflicting parameters', async () => {
    await createCheckoutSession(input);
    await createCheckoutSession({ ...input, plan: 'annual' });

    const monthly = mocks.createSession.mock.calls[0];
    const annual = mocks.createSession.mock.calls[1];
    expect(monthly[0].line_items[0].price).toBe('price_monthly');
    expect(annual[0].line_items[0].price).toBe('price_annual');
    expect(monthly[1]?.idempotencyKey).toEqual(annual[1]?.idempotencyKey);
  });
});
