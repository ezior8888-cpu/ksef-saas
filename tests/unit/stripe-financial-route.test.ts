import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finalize: vi.fn(),
  financial: vi.fn(),
  constructEvent: vi.fn(),
  captureException: vi.fn(),
  subscription: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  captureMessage: vi.fn(),
}));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));
vi.mock('@/lib/stripe/webhook-store', () => ({
  tryClaimWebhookEvent: mocks.claim,
  finalizeWebhookEvent: mocks.finalize,
}));
vi.mock('@/lib/stripe/webhook-handlers', () => ({
  handleSubscriptionUpserted: mocks.subscription,
  handleSubscriptionDeleted: mocks.subscription,
  handleInvoicePaymentFailed: mocks.subscription,
  handleInvoicePaymentSucceeded: mocks.subscription,
  handleTrialWillEnd: mocks.subscription,
}));
vi.mock('@/lib/stripe/financial-events', () => ({
  handleFinancialStripeEvent: mocks.financial,
}));

import { POST } from '@/app/api/stripe/webhook/route';
import { RetryablePreEffectWebhookError } from '@/lib/stripe/webhook-errors';

const token = '11111111-1111-4111-8111-111111111111';

function request(): Request {
  return new Request('https://app.example.test/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'fixture' },
    body: '{}',
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'synthetic-test-secret');
  mocks.claim.mockResolvedValue({ state: 'claimed', token });
  mocks.finalize.mockResolvedValue(undefined);
  mocks.financial.mockResolvedValue(undefined);
  mocks.captureException.mockReturnValue('synthetic-error-id');
});

afterEach(() => vi.unstubAllEnvs());

const financialTypes = [
  'refund.created',
  'refund.updated',
  'refund.failed',
  'charge.refund.updated',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
];

describe('Stripe financial event dispatch', () => {
  it.each(financialTypes)('claims and persists %s before acknowledging', async (type) => {
    const event = { id: 'evt_fixture1234', type, data: { object: { id: 're_fixture1234' } } };
    mocks.constructEvent.mockReturnValue(event);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledExactlyOnceWith(event.id, type, event);
    expect(mocks.financial).toHaveBeenCalledExactlyOnceWith(event);
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(event.id, token, 'processed');
  });

  it('does not acknowledge an unrecorded case after database failure', async () => {
    const event = { id: 'evt_fixture1234', type: 'refund.created', data: { object: { id: 're_fixture1234' } } };
    mocks.constructEvent.mockReturnValue(event);
    mocks.financial.mockRejectedValue(new Error('database result unknown'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(event.id, token, 'failed', 'handler_failed');
  });

  it('retries a Stripe lookup failure proven to happen before writes', async () => {
    const event = { id: 'evt_fixture1234', type: 'refund.created', data: { object: { id: 're_fixture1234' } } };
    mocks.constructEvent.mockReturnValue(event);
    mocks.financial.mockRejectedValue(new RetryablePreEffectWebhookError(
      'financial_object_lookup_failed', 'synthetic lookup failure',
    ));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(
      event.id, token, 'retryable', 'financial_object_lookup_failed',
    );
  });

  it('still skips unrelated event types before claiming them', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_fixture1234',
      type: 'customer.created',
      data: { object: {} },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.financial).not.toHaveBeenCalled();
  });
});
