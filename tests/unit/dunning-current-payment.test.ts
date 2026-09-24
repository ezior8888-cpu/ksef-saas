import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '@/lib/jobs/registry';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUserById: vi.fn(),
  sendEmail: vi.fn(),
  retrieveInvoice: vi.fn(),
  notificationInsert: vi.fn(),
  notificationUpdate: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mocks.from,
    auth: { admin: { getUserById: mocks.getUserById } },
  }),
}));
vi.mock('@/lib/email/send', () => ({ sendPaymentFailedEmail: mocks.sendEmail }));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ invoices: { retrieve: mocks.retrieveInvoice } }),
}));
vi.mock('@/lib/jobs/inngest-adapter', () => ({ toJobContext: vi.fn() }));
vi.mock('@/lib/inngest/client', () => ({
  billingPaymentFailed: { create: (data: unknown) => ({ data }) },
  inngest: { createFunction: () => ({}) },
}));

import { runDunningPaymentFailed } from '@/lib/inngest/jobs/dunning-payment-failed';

const event = {
  tenantId: 'tenant-1', paymentId: 'payment-1',
  stripeInvoiceId: 'in_1', failureReason: 'card_declined',
};
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const context: JobContext = {
  attempt: 0,
  logger,
  step: {
    run: async (_name, fn) => fn(),
    sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn(),
  },
};

let initialStatus: string;
let liveStatus: string;
let paymentTenantId: string;
let paymentInvoiceId: string;
let liveReadError: boolean;
let membershipReadError: boolean;
let paymentReadCount: number;

beforeEach(() => {
  vi.resetAllMocks();
  initialStatus = 'failed';
  liveStatus = 'failed';
  paymentTenantId = event.tenantId;
  paymentInvoiceId = event.stripeInvoiceId;
  liveReadError = false;
  membershipReadError = false;
  paymentReadCount = 0;
  mocks.sendEmail.mockResolvedValue({ sent: true, messageId: 'email-1' });
  mocks.retrieveInvoice.mockResolvedValue({ id: event.stripeInvoiceId, status: 'open' });
  mocks.getUserById.mockResolvedValue({ data: { user: { email: 'owner@example.test' } } });
  mocks.notificationInsert.mockResolvedValue({ error: null });

  mocks.from.mockImplementation((table: string) => {
    if (table === 'stripe_payments') return {
      select: (columns: string) => ({
        eq: (field: string, id: string) => ({
          maybeSingle: async () => {
            expect(field).toBe('id');
            expect(id).toBe(event.paymentId);
            paymentReadCount += 1;
            const live = columns === 'id, tenant_id, stripe_invoice_id, status';
            if (live && liveReadError) return { data: null, error: { message: 'DB unavailable' } };
            return { data: {
              id: event.paymentId,
              tenant_id: paymentTenantId,
              stripe_invoice_id: paymentInvoiceId,
              status: live ? liveStatus : initialStatus,
              amount_cents: 12000,
              failure_reason: 'card_declined',
            }, error: null };
          },
        }),
      }),
    };
    if (table === 'billing_notifications') return {
      insert: mocks.notificationInsert,
      update: (row: Record<string, unknown>) => {
        mocks.notificationUpdate(row);
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
    };
    if (table === 'memberships') return {
      select: () => {
        const query = {
          eq() { return this; }, order() { return this; }, limit() { return this; },
          async maybeSingle() {
            return membershipReadError
              ? { data: null, error: { message: 'DB unavailable' } }
              : { data: { user_id: 'user-1' }, error: null };
          },
        };
        return query;
      },
    };
    if (table === 'tenants') return {
      select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { name: 'Firma Testowa' }, error: null }),
      }) }),
    };
    throw new Error('Unexpected table: ' + table);
  });
});

describe('dunning checks persisted and Stripe invoice state before external mail', () => {
  it('skips before creating a notification when the payment already succeeded', async () => {
    initialStatus = 'succeeded';
    await expect(runDunningPaymentFailed(event, context)).resolves.toEqual({
      skipped: true, reason: 'payment-no-longer-failed',
    });
    expect(mocks.notificationInsert).not.toHaveBeenCalled();
    expect(mocks.retrieveInvoice).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('skips after claim when failed became succeeded before the send step', async () => {
    liveStatus = 'succeeded';
    await expect(runDunningPaymentFailed(event, context)).resolves.toEqual({
      skipped: true, reason: 'payment-no-longer-failed',
    });
    expect(paymentReadCount).toBe(2);
    expect(mocks.notificationInsert).toHaveBeenCalledOnce();
    expect(mocks.notificationUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
    expect(mocks.retrieveInvoice).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('rechecks within the send step despite an Inngest cached failed payment', async () => {
    liveStatus = 'succeeded';
    const cachedContext: JobContext = {
      ...context,
      step: {
        ...context.step,
        run: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> =>
          name === 'load-payment' ? {
            id: event.paymentId, tenant_id: event.tenantId,
            stripe_invoice_id: event.stripeInvoiceId, status: 'failed',
            amount_cents: 12000, failure_reason: 'card_declined',
          } as T : fn(),
      },
    };
    await expect(runDunningPaymentFailed(event, cachedContext)).resolves.toEqual({
      skipped: true, reason: 'payment-no-longer-failed',
    });
    expect(paymentReadCount).toBe(1);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('blocks a job whose payment belongs to a different tenant or invoice', async () => {
    paymentTenantId = 'other-tenant';
    await expect(runDunningPaymentFailed(event, context)).rejects.toThrow('binding mismatch');
    expect(mocks.notificationInsert).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();

    paymentTenantId = event.tenantId;
    paymentInvoiceId = 'in_other';
    await expect(runDunningPaymentFailed(event, context)).rejects.toThrow('binding mismatch');
    expect(mocks.notificationInsert).not.toHaveBeenCalled();
  });

  it('keeps the notification sending when the owner membership lookup fails', async () => {
    membershipReadError = true;
    await expect(runDunningPaymentFailed(event, context)).rejects.toThrow('Owner membership lookup failed');
    expect(mocks.notificationInsert).toHaveBeenCalledOnce();
    expect(mocks.notificationUpdate).not.toHaveBeenCalled();
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('keeps the notification sending when the owner account lookup fails', async () => {
    mocks.getUserById.mockResolvedValue({ data: { user: null }, error: { message: 'Auth unavailable' } });
    await expect(runDunningPaymentFailed(event, context)).rejects.toThrow('Owner account lookup failed');
    expect(mocks.notificationInsert).toHaveBeenCalledOnce();
    expect(mocks.notificationUpdate).not.toHaveBeenCalled();
    expect(mocks.retrieveInvoice).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('fails closed when the current DB status cannot be read', async () => {
    liveReadError = true;
    await expect(runDunningPaymentFailed(event, context)).rejects.toThrow('status read failed');
    expect(mocks.retrieveInvoice).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('skips when Stripe says the invoice is already paid despite a stale local mirror', async () => {
    mocks.retrieveInvoice.mockResolvedValue({ id: event.stripeInvoiceId, status: 'paid' });
    await expect(runDunningPaymentFailed(event, context)).resolves.toEqual({
      skipped: true, reason: 'stripe-invoice-no-longer-open',
    });
    expect(mocks.notificationUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('fails closed when Stripe invoice state is unavailable', async () => {
    mocks.retrieveInvoice.mockRejectedValue(new Error('Stripe unavailable'));
    await expect(runDunningPaymentFailed(event, context)).rejects.toThrow('could not be verified');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects a different open invoice returned by Stripe', async () => {
    mocks.retrieveInvoice.mockResolvedValue({ id: 'in_other', status: 'open' });
    await expect(runDunningPaymentFailed(event, context)).rejects.toThrow('invoice binding could not be verified');
    expect(mocks.retrieveInvoice).toHaveBeenCalledWith(event.stripeInvoiceId);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('sends once only when local payment failed and Stripe invoice remains open', async () => {
    await expect(runDunningPaymentFailed(event, context)).resolves.toEqual({
      sent: true, email: 'owner@example.test',
    });
    expect(mocks.retrieveInvoice).toHaveBeenCalledWith(event.stripeInvoiceId);
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.notificationUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  });
});
