import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  retrievePaymentIntent: vi.fn(),
  retrieveCharge: vi.fn(),
}));

vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({
    paymentIntents: { retrieve: mocks.retrievePaymentIntent },
    charges: { retrieve: mocks.retrieveCharge },
  }),
}));

import { verifyPaidInvoicePaymentReferences } from '@/lib/stripe/payment-reference-proof';
import {
  ReconciliationRequiredWebhookError,
  RetryablePreEffectWebhookError,
} from '@/lib/stripe/webhook-errors';

const PI = 'pi_ValidIntent123';
const CHARGE = 'ch_ValidCharge123';
const CUSTOMER = 'cus_Customer123';

const invoice = {
  id: 'in_ValidInvoice123',
  customer: CUSTOMER,
  amount_paid: 12000,
  currency: 'pln',
  livemode: false,
} as unknown as Stripe.Invoice;

const paymentIntent = {
  id: PI,
  status: 'succeeded',
  latest_charge: CHARGE,
  customer: CUSTOMER,
  amount_received: 12000,
  currency: 'pln',
  livemode: false,
} as unknown as Stripe.PaymentIntent;

const charge = {
  id: CHARGE,
  payment_intent: PI,
  status: 'succeeded',
  paid: true,
  disputed: false,
  amount_refunded: 0,
  amount_captured: 12000,
  customer: CUSTOMER,
  currency: 'pln',
  livemode: false,
} as unknown as Stripe.Charge;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.retrievePaymentIntent.mockResolvedValue(paymentIntent);
  mocks.retrieveCharge.mockResolvedValue(charge);
});

describe('Stripe paid invoice PI/Charge proof', () => {
  it('fills a Charge missing from the signed invoice only after verifying both Stripe objects', async () => {
    await expect(verifyPaidInvoicePaymentReferences(invoice, {
      paymentIntentId: PI,
      chargeId: null,
    })).resolves.toEqual({ paymentIntentId: PI, chargeId: CHARGE });
    expect(mocks.retrievePaymentIntent).toHaveBeenCalledWith(PI);
    expect(mocks.retrieveCharge).toHaveBeenCalledWith(CHARGE);
  });

  it('fills a PaymentIntent missing from the signed invoice by verifying the Charge', async () => {
    await expect(verifyPaidInvoicePaymentReferences(invoice, {
      paymentIntentId: null,
      chargeId: CHARGE,
    })).resolves.toEqual({ paymentIntentId: PI, chargeId: CHARGE });
    expect(mocks.retrieveCharge).toHaveBeenCalledOnce();
    expect(mocks.retrievePaymentIntent).toHaveBeenCalledWith(PI);
  });

  it('rejects two plain invoice IDs that belong to different payment attempts', async () => {
    await expect(verifyPaidInvoicePaymentReferences(invoice, {
      paymentIntentId: PI,
      chargeId: 'ch_OldAttempt123',
    })).rejects.toBeInstanceOf(ReconciliationRequiredWebhookError);
    expect(mocks.retrieveCharge).not.toHaveBeenCalled();
  });

  it('rejects a Charge that reports another PaymentIntent', async () => {
    mocks.retrieveCharge.mockResolvedValue({
      ...charge,
      payment_intent: 'pi_OtherIntent123',
    });
    await expect(verifyPaidInvoicePaymentReferences(invoice, {
      paymentIntentId: PI,
      chargeId: CHARGE,
    })).rejects.toBeInstanceOf(ReconciliationRequiredWebhookError);
  });

  it('rejects a refunded or disputed Charge before local payment effects', async () => {
    mocks.retrieveCharge.mockResolvedValue({ ...charge, amount_refunded: 100 });
    await expect(verifyPaidInvoicePaymentReferences(invoice, {
      paymentIntentId: PI,
      chargeId: CHARGE,
    })).rejects.toBeInstanceOf(ReconciliationRequiredWebhookError);
    mocks.retrieveCharge.mockResolvedValue({ ...charge, disputed: true });
    await expect(verifyPaidInvoicePaymentReferences(invoice, {
      paymentIntentId: PI,
      chargeId: CHARGE,
    })).rejects.toBeInstanceOf(ReconciliationRequiredWebhookError);
  });

  it('rejects a Customer or amount mismatch before local payment effects', async () => {
    mocks.retrieveCharge.mockResolvedValue({ ...charge, customer: 'cus_OtherCustomer123' });
    await expect(verifyPaidInvoicePaymentReferences(invoice, {
      paymentIntentId: PI,
      chargeId: CHARGE,
    })).rejects.toBeInstanceOf(ReconciliationRequiredWebhookError);
    mocks.retrieveCharge.mockResolvedValue({ ...charge, amount_captured: 11000 });
    await expect(verifyPaidInvoicePaymentReferences(invoice, {
      paymentIntentId: PI,
      chargeId: CHARGE,
    })).rejects.toBeInstanceOf(ReconciliationRequiredWebhookError);
  });

  it('marks a failed provider lookup retryable before any local write', async () => {
    mocks.retrievePaymentIntent.mockRejectedValue(new Error('temporary Stripe outage'));
    await expect(verifyPaidInvoicePaymentReferences(invoice, {
      paymentIntentId: PI,
      chargeId: null,
    })).rejects.toBeInstanceOf(RetryablePreEffectWebhookError);
    expect(mocks.retrieveCharge).not.toHaveBeenCalled();
  });
});