import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  createCustomer: vi.fn(),
  retrieveCustomer: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ customers: {
    create: mocks.createCustomer,
    retrieve: mocks.retrieveCustomer,
  } }),
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));

import { ensureStripeCustomer } from '@/lib/stripe/customer';

const input = { tenantId: 'tenant-test', email: 'owner@example.test', name: 'Firma Testowa' };

function fakeTenantStore(initialId: string | null, options?: {
  tenantExists?: boolean;
  ambiguousWrite?: boolean;
  suppressWrite?: boolean;
}) {
  let storedId = initialId;
  const isNull = vi.fn();
  const update = vi.fn((row: { stripe_customer_id: string }) => ({
    eq: (column: string, tenantId: string) => ({
      is: (field: string, value: null) => {
        expect(column).toBe('id');
        expect(tenantId).toBe(input.tenantId);
        expect(field).toBe('stripe_customer_id');
        isNull(field, value);
        return {
          select: () => ({
            maybeSingle: async () => {
              if (options?.tenantExists === false || storedId !== null || options?.suppressWrite) {
                return { data: null, error: null };
              }
              storedId = row.stripe_customer_id;
              return options?.ambiguousWrite
                ? { data: null, error: { message: 'ambiguous DB response' } }
                : { data: { stripe_customer_id: storedId }, error: null };
            },
          }),
        };
      },
    }),
  }));
  const select = vi.fn(() => ({
    eq: (column: string, tenantId: string) => ({
      // Capture at call time so simultaneous initial reads both see NULL.
      maybeSingle: () => {
        expect(column).toBe('id');
        expect(tenantId).toBe(input.tenantId);
        return Promise.resolve({
          data: options?.tenantExists === false ? null : { stripe_customer_id: storedId },
          error: null,
        });
      },
    }),
  }));
  mocks.from.mockReturnValue({ select, update });
  return { update, isNull, currentId: () => storedId };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.retrieveCustomer.mockImplementation(async (id: string) => ({
    id, metadata: { tenantId: input.tenantId },
  }));
});

describe('ensureStripeCustomer compare-and-set', () => {
  it('returns the already assigned customer without creating another', async () => {
    fakeTenantStore('cus_existing');
    await expect(ensureStripeCustomer(input)).resolves.toEqual({
      customerId: 'cus_existing', created: false,
    });
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.retrieveCustomer).toHaveBeenCalledWith('cus_existing');
  });

  it('stores and returns the new customer when it wins the NULL compare-and-set', async () => {
    const db = fakeTenantStore(null);
    mocks.createCustomer.mockResolvedValue({ id: 'cus_winner' });

    await expect(ensureStripeCustomer(input)).resolves.toEqual({
      customerId: 'cus_winner', created: true,
    });
    expect(db.isNull).toHaveBeenCalledWith('stripe_customer_id', null);
    expect(db.currentId()).toBe('cus_winner');
  });

  it('returns only the stored winner when two requests create customers concurrently', async () => {
    const db = fakeTenantStore(null);
    mocks.createCustomer
      .mockResolvedValueOnce({ id: 'cus_first' })
      .mockResolvedValueOnce({ id: 'cus_second' });

    const results = await Promise.all([
      ensureStripeCustomer(input),
      ensureStripeCustomer(input),
    ]);

    expect(mocks.createCustomer).toHaveBeenCalledTimes(2);
    expect(db.isNull).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { customerId: 'cus_first', created: true },
      { customerId: 'cus_first', created: false },
    ]);
    expect(db.currentId()).toBe('cus_first');
  });

  it('uses a fresh read after an ambiguous write and returns only the assigned ID', async () => {
    fakeTenantStore(null, { ambiguousWrite: true });
    mocks.createCustomer.mockResolvedValue({ id: 'cus_ambiguous' });

    await expect(ensureStripeCustomer(input)).resolves.toEqual({
      customerId: 'cus_ambiguous', created: true,
    });
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it('fails closed when its new Stripe customer was not assigned to any tenant', async () => {
    fakeTenantStore(null, { suppressWrite: true });
    mocks.createCustomer.mockResolvedValue({ id: 'cus_unassigned' });

    await expect(ensureStripeCustomer(input)).rejects.toThrow('not assigned');
  });

  it.each([
    ['another tenant', { id: 'cus_existing', metadata: { tenantId: 'other-tenant' } }],
    ['missing legacy metadata', { id: 'cus_existing', metadata: {} }],
    ['deleted customer', { id: 'cus_existing', deleted: true }],
  ])('fails closed for an existing customer with %s', async (_label, stripeCustomer) => {
    fakeTenantStore('cus_existing');
    mocks.retrieveCustomer.mockResolvedValue(stripeCustomer);

    await expect(ensureStripeCustomer(input)).rejects.toThrow('manual reconciliation');
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalledOnce();
  });

  it('fails closed when the winning CAS ID belongs to a different tenant in Stripe', async () => {
    fakeTenantStore(null);
    mocks.createCustomer.mockResolvedValue({ id: 'cus_mismatch' });
    mocks.retrieveCustomer.mockResolvedValue({
      id: 'cus_mismatch', metadata: { tenantId: 'other-tenant' },
    });

    await expect(ensureStripeCustomer(input)).rejects.toThrow('manual reconciliation');
  });

  it('fails closed when Stripe cannot confirm the customer binding', async () => {
    fakeTenantStore('cus_existing');
    mocks.retrieveCustomer.mockRejectedValue(new Error('temporary Stripe failure'));

    await expect(ensureStripeCustomer(input)).rejects.toThrow('verification failed');
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it('does not create a Stripe customer for a missing tenant', async () => {
    fakeTenantStore(null, { tenantExists: false });
    await expect(ensureStripeCustomer(input)).rejects.toThrow('tenant not found');
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });
});
