import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createCustomer: vi.fn(),
  retrieveCustomer: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({
    customers: {
      create: mocks.createCustomer,
      retrieve: mocks.retrieveCustomer,
    },
  }),
}));
vi.mock('@sentry/nextjs', () => ({
  captureMessage: mocks.captureMessage,
}));

import { ensureStripeCustomer } from '@/lib/stripe/customer';

const input = {
  tenantId: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.test',
  name: 'Firma Testowa',
  nip: '1234567890',
};
const attemptId = '11111111-1111-4111-8111-111111111111';

function fakeCustomerClaimStore(
  initialCustomerId: string | null = null,
  options?: { recordCommittedButResponseLost?: boolean; recordRejected?: boolean },
) {
  let customerId = initialCustomerId;
  let status: 'none' | 'creating' | 'uncertain' | 'completed' =
    initialCustomerId ? 'completed' : 'none';
  let observedCustomerId: string | null = null;
  const calls: string[] = [];

  mocks.rpc.mockImplementation(async (
    name: string,
    args: Record<string, unknown>,
  ) => {
    calls.push(name);
    expect(args.p_tenant_id).toBe(input.tenantId);
    if (name === 'claim_stripe_customer_attempt') {
      if (customerId) {
        return { data: { state: 'existing', customerId }, error: null };
      }
      if (status === 'none') {
        status = 'creating';
        return { data: { state: 'claimed', attemptId }, error: null };
      }
      return { data: { state: status, attemptId }, error: null };
    }
    if (name === 'record_stripe_customer_attempt') {
      expect(args.p_attempt_id).toBe(attemptId);
      if (options?.recordRejected) {
        return { data: false, error: null };
      }
      customerId = String(args.p_customer_id);
      status = 'completed';
      return options?.recordCommittedButResponseLost
        ? { data: null, error: { message: 'lost response' } }
        : { data: true, error: null };
    }
    if (name === 'hold_stripe_customer_attempt') {
      expect(args.p_attempt_id).toBe(attemptId);
      if (status !== 'creating') return { data: false, error: null };
      status = 'uncertain';
      observedCustomerId = args.p_customer_id as string | null;
      return { data: true, error: null };
    }
    throw new Error('Unexpected RPC ' + name);
  });

  return {
    calls,
    current: () => ({ customerId, status, observedCustomerId }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.retrieveCustomer.mockImplementation(async (id: string) => ({
    id,
    metadata: { tenantId: input.tenantId },
  }));
});

describe('durable Stripe Customer claim', () => {
  it('verifies and reuses an existing mapped Customer', async () => {
    fakeCustomerClaimStore('cus_existing');
    await expect(ensureStripeCustomer(input)).resolves.toEqual({
      customerId: 'cus_existing', created: false,
    });
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.retrieveCustomer).toHaveBeenCalledWith('cus_existing');
  });

  it('creates once and atomically maps the Customer after verification', async () => {
    const db = fakeCustomerClaimStore();
    mocks.createCustomer.mockResolvedValue({ id: 'cus_first' });
    await expect(ensureStripeCustomer(input)).resolves.toEqual({
      customerId: 'cus_first', created: true,
    });
    expect(db.current()).toEqual({
      customerId: 'cus_first', status: 'completed', observedCustomerId: null,
    });
    expect(db.calls).toEqual([
      'claim_stripe_customer_attempt',
      'record_stripe_customer_attempt',
    ]);
    expect(mocks.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        email: input.email,
        metadata: { tenantId: input.tenantId, customerAttemptId: attemptId, nip: input.nip },
      }),
      { idempotencyKey: 'faktflow-customer-v1:' + attemptId },
    );
  });

  it('blocks a concurrent first request before a second Stripe create', async () => {
    const db = fakeCustomerClaimStore();
    let finishCreate: ((value: { id: string }) => void) | undefined;
    mocks.createCustomer.mockImplementation(() => new Promise((resolve) => {
      finishCreate = resolve;
    }));

    const first = ensureStripeCustomer(input);
    await vi.waitFor(() => expect(mocks.createCustomer).toHaveBeenCalledOnce());
    await expect(ensureStripeCustomer(input)).rejects.toThrow('manual reconciliation');
    expect(mocks.createCustomer).toHaveBeenCalledOnce();

    finishCreate?.({ id: 'cus_first' });
    await expect(first).resolves.toEqual({ customerId: 'cus_first', created: true });
    expect(db.current().customerId).toBe('cus_first');
  });

  it('holds an ambiguous provider error indefinitely without another create', async () => {
    const db = fakeCustomerClaimStore();
    mocks.createCustomer.mockRejectedValue(new Error('connection reset'));
    await expect(ensureStripeCustomer(input)).rejects.toThrow('manual reconciliation');
    expect(db.current()).toEqual({
      customerId: null, status: 'uncertain', observedCustomerId: null,
    });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
      await expect(ensureStripeCustomer(input)).rejects.toThrow('manual reconciliation');
    } finally {
      vi.useRealTimers();
    }
    expect(mocks.createCustomer).toHaveBeenCalledOnce();
  });

  it('stores a returned but unverified Customer ID in the hold', async () => {
    const db = fakeCustomerClaimStore();
    mocks.createCustomer.mockResolvedValue({ id: 'cus_unverified' });
    mocks.retrieveCustomer.mockRejectedValue(new Error('Stripe unavailable'));
    await expect(ensureStripeCustomer(input)).rejects.toThrow('manual reconciliation');
    expect(db.current()).toEqual({
      customerId: null, status: 'uncertain', observedCustomerId: 'cus_unverified',
    });
  });

  it('resolves a committed assignment after an RPC response is lost', async () => {
    fakeCustomerClaimStore(null, { recordCommittedButResponseLost: true });
    mocks.createCustomer.mockResolvedValue({ id: 'cus_mapped' });
    await expect(ensureStripeCustomer(input)).resolves.toEqual({
      customerId: 'cus_mapped', created: true,
    });
    expect(mocks.createCustomer).toHaveBeenCalledOnce();
  });

  it('holds an observed ID when the mapping was not committed', async () => {
    const db = fakeCustomerClaimStore(null, { recordRejected: true });
    mocks.createCustomer.mockResolvedValue({ id: 'cus_orphan' });
    await expect(ensureStripeCustomer(input)).rejects.toThrow(
      'assignment could not be verified',
    );
    expect(db.current()).toEqual({
      customerId: null, status: 'uncertain', observedCustomerId: 'cus_orphan',
    });
    await expect(ensureStripeCustomer(input)).rejects.toThrow('manual reconciliation');
    expect(mocks.createCustomer).toHaveBeenCalledOnce();
  });

  it.each([
    ['foreign tenant', { id: 'cus_existing', metadata: { tenantId: 'other' } }],
    ['deleted', { id: 'cus_existing', deleted: true }],
    ['wrong returned ID', { id: 'cus_other', metadata: { tenantId: input.tenantId } }],
  ])('rejects an existing Customer with %s', async (_case, stripeCustomer) => {
    fakeCustomerClaimStore('cus_existing');
    mocks.retrieveCustomer.mockResolvedValue(stripeCustomer);
    await expect(ensureStripeCustomer(input)).rejects.toThrow('manual reconciliation');
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it('does not call Stripe when the tenant claim fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'tenant missing' } });
    await expect(ensureStripeCustomer(input)).rejects.toThrow('claim failed');
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it('does not call Stripe on malformed claim responses', async () => {
    mocks.rpc.mockResolvedValue({ data: { state: 'claimed', attemptId: 'bad' }, error: null });
    await expect(ensureStripeCustomer(input)).rejects.toThrow('attempt ID');
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });
});
