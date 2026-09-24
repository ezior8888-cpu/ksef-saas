import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '@/lib/jobs/registry';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  build: vi.fn(),
  insert: vi.fn(),
  audit: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/billing/operator-config', () => ({ isSelfInvoicingConfigured: () => true }));
vi.mock('@/lib/billing/self-invoice', () => ({
  buildSelfInvoiceDraft: mocks.build,
  insertSelfInvoice: mocks.insert,
}));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.capture }));
vi.mock('@/lib/jobs/inngest-adapter', () => ({ toJobContext: vi.fn() }));
vi.mock('@/lib/inngest/client', () => ({
  billingPaymentSucceeded: { create: (data: unknown) => ({ data }) },
  invoiceSubmitRequested: { create: (data: unknown) => ({ data }) },
  inngest: { createFunction: () => ({}) },
}));

import { runSelfInvoicePayment } from '@/lib/inngest/jobs/self-invoice-payment';

const event = {
  tenantId: 'customer-tenant',
  paymentId: 'payment-1',
  stripeInvoiceId: 'in_1',
  amountCents: 12000,
  taxCents: 2244,
  currency: 'pln',
  paidAt: '2026-09-24T10:00:00.000Z',
};

let paymentStatus: string;
let statusReadError: boolean;
const sentEvent = vi.fn();
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const context: JobContext = {
  attempt: 0,
  logger,
  step: {
    run: async (_name, fn) => fn(),
    sleep: vi.fn(),
    sendEvent: sentEvent,
    scheduleAfter: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  paymentStatus = 'succeeded';
  statusReadError = false;
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'stripe_payments') throw new Error('Unexpected table: ' + table);
    return {
      select: (columns: string) => ({
        eq: () => ({ maybeSingle: async () => {
          if (columns === 'status' && statusReadError) {
            return { data: null, error: { message: 'temporary read failure' } };
          }
          return {
            data: columns === 'status' ? { status: paymentStatus } : {
              id: event.paymentId,
              tenant_id: event.tenantId,
              amount_cents: event.amountCents,
              status: paymentStatus,
              paid_at: event.paidAt,
              vat_invoice_id: null,
              subscription_id: null,
            },
            error: null,
          };
        } }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    };
  });
  mocks.build.mockResolvedValue({
    operator: { tenantId: 'operator-tenant', nip: '1234567890' },
    invoice: { id: 'draft-invoice' },
  });
  mocks.insert.mockResolvedValue({ invoiceId: 'vat-invoice', internalNumber: 'VAT-1' });
  mocks.audit.mockResolvedValue(undefined);
});

describe('VAT self-invoice for a delayed payment job', () => {
  it.each(['refunded', 'partially_refunded', 'failed', 'pending'])(
    'skips payment in %s status before creating or submitting an invoice',
    async (status) => {
      paymentStatus = status;

      await expect(runSelfInvoicePayment(event, context)).resolves.toEqual({
        skipped: true,
        reason: 'payment-not-succeeded',
      });

      expect(mocks.build).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(sentEvent).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );

  it('rechecks status before invoice creation when Inngest replays a cached paid row after refund', async () => {
    paymentStatus = 'refunded';
    const cachedPaidRow = {
      id: event.paymentId,
      tenant_id: event.tenantId,
      amount_cents: event.amountCents,
      status: 'succeeded',
      paid_at: event.paidAt,
      vat_invoice_id: null,
      subscription_id: null,
    };
    const resumedContext: JobContext = {
      ...context,
      step: {
        ...context.step,
        run: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> =>
          name === 'load-payment' ? cachedPaidRow as T : fn(),
      },
    };

    await expect(runSelfInvoicePayment(event, resumedContext)).resolves.toEqual({
      skipped: true,
      reason: 'payment-not-succeeded',
    });
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(sentEvent).not.toHaveBeenCalled();
  });

  it('retries on a failed current-status read before creating an invoice', async () => {
    statusReadError = true;

    await expect(runSelfInvoicePayment(event, context)).rejects.toThrow(
      'payment status read failed',
    );
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(sentEvent).not.toHaveBeenCalled();
  });

  it('still creates and queues a VAT invoice for a succeeded payment', async () => {
    await expect(runSelfInvoicePayment(event, context)).resolves.toMatchObject({
      success: true,
      invoiceId: 'vat-invoice',
    });

    expect(mocks.build).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(sentEvent).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
});
