import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  constructEvent: vi.fn(),
  claim: vi.fn(),
  finalize: vi.fn(),
  handler: vi.fn(),
  admin: vi.fn(),
  exportData: vi.fn(),
  posthog: vi.fn(),
  flush: vi.fn(),
  capture: vi.fn(),
  insert: vi.fn(),
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
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/exports/data-fetcher', () => ({ fetchInvoicesForExport: mocks.exportData }));
vi.mock('@/lib/exports/jpk-fa-generator', () => ({ generateJpkFa: vi.fn() }));
vi.mock('@/lib/exports/kpir-generator', () => ({ generateKpirXlsx: vi.fn() }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
vi.mock('@/lib/email/preferences', () => ({ ALL_CATEGORIES: [], unsubscribe: vi.fn() }));
vi.mock('@/lib/analytics/posthog-node-client', () => ({ getPostHogNodeClient: mocks.posthog }));

import { POST as stripeWebhook } from '@/app/api/stripe/webhook/route';
import { POST as resendWebhook } from '@/app/api/email/resend-webhook/route';
import { POST as portalExport } from '@/app/api/portal/exports/generate/route';
import { GET as posthogTest } from '@/app/api/dev/posthog-test/route';

const PRIVATE_ERROR = 'private_schema.internal_table: local-only-diagnostic-sentinel';
const ERROR_ID = 'a'.repeat(32);
const svixKey = Buffer.from('fake-test-signing-key');
const tenantId = '11111111-1111-4111-8111-111111111111';

function stripeRequest() {
  return new Request('https://app.example.test/api/stripe/webhook', {
    method: 'POST', headers: { 'stripe-signature': 'test-signature' }, body: '{}',
  });
}

function resendRequest(timestamp = String(Math.floor(Date.now() / 1000)), version = 'v1') {
  const body = JSON.stringify({
    type: 'email.bounced',
    data: { to: ['test@example.test'], bounce: { type: 'soft' } },
  });
  const id = 'test-event';
  const signature = createHmac('sha256', svixKey).update(id + '.' + timestamp + '.' + body).digest('base64');
  return new Request('https://app.example.test/api/email/resend-webhook', {
    method: 'POST',
    headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': version + ',' + signature },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'fake-stripe-secret');
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_' + svixKey.toString('base64'));
  mocks.captureException.mockReturnValue(ERROR_ID);
  mocks.claim.mockResolvedValue({ state: 'claimed', token: '11111111-1111-4111-8111-111111111111' });
  mocks.finalize.mockResolvedValue(undefined);
  mocks.handler.mockResolvedValue(undefined);
  mocks.constructEvent.mockReturnValue({
    id: 'evt_test', type: 'customer.subscription.created', data: { object: {} },
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.admin.mockReturnValue({ from: () => ({ insert: mocks.insert }) });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('SEC-A-01: HTTP responses never expose internal exception messages', () => {
  it('rejects invalid Stripe signatures without reflecting SDK diagnostics or logging attack noise', async () => {
    mocks.constructEvent.mockImplementation(() => { throw new Error(PRIVATE_ERROR); });
    const response = await stripeWebhook(stripeRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid signature' });
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('returns a correlation id for Stripe dispatch errors and preserves retry status', async () => {
    mocks.handler.mockRejectedValue(new Error(PRIVATE_ERROR));
    const response = await stripeWebhook(stripeRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Handler failed', errorId: ERROR_ID });
    expect(mocks.captureException).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
    expect(mocks.finalize).toHaveBeenCalledWith('evt_test', '11111111-1111-4111-8111-111111111111', 'failed', 'handler_failed');
  });

  it('preserves a safe retry response when recording a Stripe handler failure also fails', async () => {
    mocks.handler.mockRejectedValue(new Error(PRIVATE_ERROR));
    mocks.finalize.mockRejectedValue(new Error('another-private-diagnostic'));
    const response = await stripeWebhook(stripeRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Handler failed', errorId: ERROR_ID });
    expect(mocks.captureException).toHaveBeenCalledTimes(2);
  });

  it('returns a correlation id when Stripe idempotency storage fails', async () => {
    mocks.claim.mockRejectedValue(new Error(PRIVATE_ERROR));
    const response = await stripeWebhook(stripeRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Idempotency check failed', errorId: ERROR_ID });
    expect(mocks.handler).not.toHaveBeenCalled();
  });

  it('does not disclose Resend database exceptions', async () => {
    mocks.insert.mockResolvedValue({ error: { code: 'XX000', message: PRIVATE_ERROR } });
    const response = await resendWebhook(resendRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook processing failed', errorId: ERROR_ID });
  });

  it('does not disclose export errors after valid accountant authorization', async () => {
    mocks.admin.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: 'access-test', tenant_id: tenantId, access_level: 'download', revoked_at: null, expires_at: null },
        error: null,
      }) }) }) }),
    });
    mocks.exportData.mockRejectedValue(new Error(PRIVATE_ERROR));
    const response = await portalExport(new NextRequest('https://app.example.test/api/portal/exports/generate', {
      method: 'POST', headers: { 'x-accountant-token': 'fake-accountant-token' },
      body: JSON.stringify({ tenantId, format: 'jpk_fa', periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Nie udało się wygenerować pliku. Spróbuj ponownie później.', errorId: ERROR_ID,
    });
  });

  it('contains storage initialization errors within the portal response boundary', async () => {
    mocks.admin.mockImplementation(() => { throw new Error(PRIVATE_ERROR); });
    const response = await portalExport(new NextRequest('https://app.example.test/api/portal/exports/generate', {
      method: 'POST', headers: { 'x-accountant-token': 'fake-accountant-token' },
    }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(PRIVATE_ERROR);
  });

  it('does not disclose PostHog client initialization errors', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    mocks.posthog.mockImplementation(() => { throw new Error(PRIVATE_ERROR); });
    const response = await posthogTest();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: 'PostHog test failed', errorId: ERROR_ID });
  });

  it('does not disclose PostHog test exceptions', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.posthog.mockReturnValue({ capture: mocks.capture, flush: mocks.flush });
    mocks.flush.mockRejectedValue(new Error(PRIVATE_ERROR));
    const response = await posthogTest();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: 'PostHog test failed', errorId: ERROR_ID });
  });
});

describe('Svix replay protection', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-09T12:00:00Z')); });

  it.each([-301, 301])('rejects a correctly signed event outside the five-minute window (%i seconds)', async (offset) => {
    const timestamp = String(Math.floor(Date.now() / 1000) + offset);
    const response = await resendWebhook(resendRequest(timestamp));
    expect(response.status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each(['not-a-time', '1e9', '0', '9007199254740993'])('rejects malformed or stale signed timestamps: %s', async (timestamp) => {
    const response = await resendWebhook(resendRequest(timestamp));
    expect(response.status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('rejects unsupported signature versions even if the HMAC matches', async () => {
    const response = await resendWebhook(resendRequest(undefined, 'v2'));
    expect(response.status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([-300, 0, 300])('accepts valid deliveries within the allowed window (%i seconds)', async (offset) => {
    const timestamp = String(Math.floor(Date.now() / 1000) + offset);
    const response = await resendWebhook(resendRequest(timestamp));
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledOnce();
  });
});
