import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finalize: vi.fn(),
  handler: vi.fn(),
  constructEvent: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));
vi.mock('@/lib/stripe/webhook-store', () => ({
  tryClaimWebhookEvent: mocks.claim,
  finalizeWebhookEvent: mocks.finalize,
}));
vi.mock('@/lib/stripe/webhook-handlers', () => ({
  handleSubscriptionUpserted: mocks.handler,
  handleSubscriptionDeleted: mocks.handler,
  handleInvoicePaymentFailed: mocks.handler,
  handleInvoicePaymentSucceeded: mocks.handler,
  handleTrialWillEnd: mocks.handler,
}));

import { POST } from '@/app/api/stripe/webhook/route';
import { RetryablePreEffectWebhookError } from '@/lib/stripe/webhook-errors';

const token = '11111111-1111-4111-8111-111111111111';
const event = {
  id: 'evt_claim_fixture',
  type: 'customer.subscription.created',
  data: { object: {} },
};

function request() {
  return new Request('https://app.example.test/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'fixture' },
    body: '{}',
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'synthetic-test-secret');
  mocks.constructEvent.mockReturnValue(event);
  mocks.claim.mockResolvedValue({ state: 'claimed', token });
  mocks.handler.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue(undefined);
  mocks.captureException.mockReturnValue('synthetic-error-id');
});

afterEach(() => { vi.unstubAllEnvs(); });

describe('Stripe webhook claim ownership', () => {
  it('does not acknowledge an in-flight delivery or run its handler twice', async () => {
    let finishHandler!: () => void;
    mocks.handler.mockReturnValue(new Promise<void>((resolve) => {
      finishHandler = resolve;
    }));
    mocks.claim.mockResolvedValueOnce({ state: 'claimed', token })
      .mockResolvedValueOnce({ state: 'busy' });

    const first = POST(request());
    await vi.waitFor(() => expect(mocks.handler).toHaveBeenCalledOnce());
    const secondResponse = await POST(request());
    expect(secondResponse.status).toBe(503);
    expect(secondResponse.headers.get('Retry-After')).toBe('60');
    expect(mocks.handler).toHaveBeenCalledOnce();
    expect(mocks.finalize).not.toHaveBeenCalled();

    finishHandler();
    const firstResponse = await first;
    expect(firstResponse.status).toBe(200);
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(event.id, token, 'processed');
  });

  it('acknowledges a completed duplicate without dispatch', async () => {
    mocks.claim.mockResolvedValue({ state: 'processed' });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ duplicate: true, eventId: event.id });
    expect(mocks.handler).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('records only a safe error code after handler failure', async () => {
    const privateMessage = 'private_schema.secret_diagnostic';
    mocks.handler.mockRejectedValue(new Error(privateMessage));

    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(privateMessage);
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(
      event.id, token, 'failed', 'handler_failed',
    );
  });

  it('retries only a typed failure proven to precede side effects', async () => {
    mocks.handler.mockRejectedValue(new RetryablePreEffectWebhookError(
      'subscription_not_found', 'synthetic missing row',
    ));

    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(
      event.id, token, 'retryable', 'subscription_not_found',
    );
  });

  it('does not relabel successful dispatch as failed after finalization error', async () => {
    mocks.finalize.mockRejectedValue(new Error('database response lost'));

    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Finalization failed', errorId: 'synthetic-error-id',
    });
    expect(mocks.handler).toHaveBeenCalledOnce();
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(event.id, token, 'processed');
  });
});
