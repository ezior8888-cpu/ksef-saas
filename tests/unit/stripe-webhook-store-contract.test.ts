import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

import {
  finalizeWebhookEvent,
  tryClaimWebhookEvent,
} from '@/lib/stripe/webhook-store';

const event = { id: 'evt_contract', type: 'invoice.payment_succeeded' };
const token = '11111111-1111-4111-8111-111111111111';

beforeEach(() => { mocks.rpc.mockReset(); });

describe('Stripe webhook receipt RPC contract', () => {
  it.each([
    [{ state: 'claimed', token }, { state: 'claimed', token }],
    [{ state: 'processed' }, { state: 'processed' }],
    [{ state: 'busy' }, { state: 'busy' }],
  ])('returns only a validated claim state', async (dbResult, expected) => {
    mocks.rpc.mockResolvedValue({ data: dbResult, error: null });
    await expect(tryClaimWebhookEvent(event.id, event.type, event)).resolves.toEqual(expected);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_stripe_webhook_event', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_payload: event,
    });
  });

  it.each([null, {}, [], { state: 'claimed' }, { state: 'claimed', token: 'bad' },
    { state: 'unknown' }])('fails closed on malformed claim response: %j', async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(tryClaimWebhookEvent(event.id, event.type, event))
      .rejects.toThrow('Unexpected webhook claim response');
  });

  it('keeps an in-flight or failed receipt blocked even if a token is present', async () => {
    mocks.rpc.mockResolvedValue({ data: { state: 'busy', token }, error: null });
    await expect(tryClaimWebhookEvent(event.id, event.type, event))
      .resolves.toEqual({ state: 'busy' });
  });

  it('does not dispatch on a database claim error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'db unavailable' } });
    await expect(tryClaimWebhookEvent(event.id, event.type, event))
      .rejects.toThrow('webhook claim failed');
  });

  it('finalizes only with the owner token and an acknowledged database update', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await expect(finalizeWebhookEvent(event.id, token, 'processed')).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith('finalize_stripe_webhook_event', {
      p_event_id: event.id,
      p_claim_token: token,
      p_status: 'processed',
      p_error_code: null,
    });
  });

  it('records an explicitly safe pre-effect failure as retryable with the owner token', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await expect(finalizeWebhookEvent(event.id, token, 'retryable', 'missing_subscription'))
      .resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith('finalize_stripe_webhook_event', {
      p_event_id: event.id,
      p_claim_token: token,
      p_status: 'retryable',
      p_error_code: 'missing_subscription',
    });
  });

  it.each([
    [{ data: false, error: null }, 'not confirmed'],
    [{ data: null, error: null }, 'not confirmed'],
    [{ data: null, error: { message: 'claim owner mismatch' } }, 'finalization failed'],
  ])('rejects a missing or failed finalization acknowledgement', async (response, message) => {
    mocks.rpc.mockResolvedValue(response);
    await expect(finalizeWebhookEvent(event.id, token, 'failed', 'handler_failed'))
      .rejects.toThrow(message);
  });

  it('rejects unsafe error details before sending them to the database', async () => {
    await expect(finalizeWebhookEvent(event.id, token, 'failed', 'private: table name'))
      .rejects.toThrow('Invalid webhook finalization arguments');
    await expect(finalizeWebhookEvent(event.id, 'invalid-token', 'processed'))
      .rejects.toThrow('Invalid webhook finalization arguments');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
