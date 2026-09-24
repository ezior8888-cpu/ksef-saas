import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveBilledPlanFromPaidInvoice } from '@/lib/stripe/billed-plan';

const input = {
  stripeInvoiceId: 'in_paid',
  stripeSubscriptionId: 'sub_owned',
  stripeCustomerId: 'cus_owned',
  amountCents: 5900,
  currency: 'pln',
};

function acaciaInvoice() {
  return {
    object: 'invoice',
    id: 'in_paid',
    status: 'paid',
    paid: true,
    paid_out_of_band: false,
    amount_paid: 5900,
    total: 5900,
    amount_remaining: 0,
    currency: 'pln',
    customer: 'cus_owned',
    subscription: 'sub_owned',
    lines: {
      has_more: false,
      total_count: 1,
      data: [{
        object: 'line_item',
        invoice: 'in_paid',
        currency: 'pln',
        quantity: 1,
        type: 'subscription',
        subscription: 'sub_owned',
        proration: false,
        price: { id: 'price_monthly' },
      }],
    },
  };
}

function basilInvoice() {
  return {
    object: 'invoice',
    id: 'in_paid',
    status: 'paid',
    amount_paid: 5900,
    total: 5900,
    amount_remaining: 0,
    currency: 'pln',
    customer: { id: 'cus_owned' },
    parent: {
      type: 'subscription_details',
      subscription_details: { subscription: 'sub_owned' },
    },
    lines: {
      has_more: false,
      total_count: 1,
      data: [{
        object: 'line_item',
        invoice: 'in_paid',
        currency: 'pln',
        quantity: 1,
        quantity_decimal: '1.000',
        parent: {
          type: 'subscription_item_details',
          subscription_item_details: {
            subscription: 'sub_owned',
            proration: false,
          },
        },
        pricing: {
          type: 'price_details',
          price_details: { price: 'price_annual' },
        },
      }],
    },
  };
}

function derive(snapshot: unknown) {
  return deriveBilledPlanFromPaidInvoice({ ...input, snapshot });
}

function rejects(snapshot: unknown) {
  expect(() => derive(snapshot)).toThrow('Paid Stripe invoice requires manual reconciliation');
}

beforeEach(() => {
  vi.stubEnv('STRIPE_PRICE_MONTHLY', 'price_monthly');
  vi.stubEnv('STRIPE_PRICE_ANNUAL', 'price_annual');
});

afterEach(() => vi.unstubAllEnvs());

describe('deriveBilledPlanFromPaidInvoice', () => {
  it('uses the paid Acacia line Price ID, not any later subscription plan', () => {
    const paidSnapshot = acaciaInvoice();
    expect(derive(paidSnapshot)).toBe('monthly');
    paidSnapshot.lines.data[0].price.id = 'price_annual';
    expect(derive(paidSnapshot)).toBe('annual');
  });

  it('uses the Basil parent and pricing fields', () => {
    expect(derive(basilInvoice())).toBe('annual');
  });

  it('accepts matching old and new fields during a version transition', () => {
    const invoice = basilInvoice();
    const line = invoice.lines.data[0];
    expect(derive({
      ...invoice,
      subscription: 'sub_owned',
      lines: {
        ...invoice.lines,
        data: [{
          ...line,
          type: 'subscription',
          subscription: 'sub_owned',
          proration: false,
          price: { id: 'price_annual' },
        }],
      },
    })).toBe('annual');
  });

  it.each([
    ['missing snapshot', null],
    ['wrong invoice id', { ...acaciaInvoice(), id: 'in_other' }],
    ['missing paid status', { ...acaciaInvoice(), status: null }],
    ['open invoice', { ...acaciaInvoice(), status: 'open' }],
    ['unpaid Acacia invoice', { ...acaciaInvoice(), paid: false }],
    ['out-of-band payment', { ...acaciaInvoice(), paid_out_of_band: true }],
    ['wrong customer', { ...acaciaInvoice(), customer: 'cus_other' }],
    ['wrong invoice subscription', { ...acaciaInvoice(), subscription: 'sub_other' }],
    ['wrong invoice amount', { ...acaciaInvoice(), amount_paid: 6000 }],
    ['partial payment', { ...acaciaInvoice(), amount_remaining: 100 }],
    ['credit or partial total', { ...acaciaInvoice(), total: 6000 }],
    ['wrong currency', { ...acaciaInvoice(), currency: 'eur' }],
  ])('rejects %s before billing', (_name, snapshot) => {
    rejects(snapshot);
  });

  it('rejects an input for another invoice, customer, subscription, amount or currency', () => {
    const snapshot = acaciaInvoice();
    for (const changed of [
      { stripeInvoiceId: 'in_other' },
      { stripeCustomerId: 'cus_other' },
      { stripeSubscriptionId: 'sub_other' },
      { amountCents: 6000 },
      { amountCents: 0 },
      { currency: 'eur' },
    ]) {
      expect(() => deriveBilledPlanFromPaidInvoice({ ...input, ...changed, snapshot }))
        .toThrow('Paid Stripe invoice requires manual reconciliation');
    }
  });

  it('rejects a conflicting invoice subscription in a hybrid payload', () => {
    rejects({ ...basilInvoice(), subscription: 'sub_other' });
  });

  it('rejects a conflicting Price ID in a hybrid line', () => {
    const invoice = basilInvoice();
    rejects({
      ...invoice,
      lines: {
        ...invoice.lines,
        data: [{
          ...invoice.lines.data[0],
          type: 'subscription',
          subscription: 'sub_owned',
          proration: false,
          price: { id: 'price_monthly' },
        }],
      },
    });
  });

  it('rejects a foreign Basil subscription or customer', () => {
    const invoice = basilInvoice();
    rejects({
      ...invoice,
      parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_other' } },
    });
    rejects({
      ...invoice,
      lines: {
        ...invoice.lines,
        data: [{
          ...invoice.lines.data[0],
          parent: {
            type: 'subscription_item_details',
            subscription_item_details: { subscription: 'sub_other', proration: false },
          },
        }],
      },
    });
  });

  it('rejects missing, paginated, multiple or extra invoice lines', () => {
    const invoice = acaciaInvoice();
    rejects({ ...invoice, lines: null });
    rejects({ ...invoice, lines: { ...invoice.lines, has_more: true } });
    rejects({ ...invoice, lines: { ...invoice.lines, total_count: 2 } });
    rejects({ ...invoice, subscription: null });
    rejects({
      ...invoice,
      lines: { ...invoice.lines, data: [invoice.lines.data[0], invoice.lines.data[0]] },
    });
    rejects({
      ...invoice,
      lines: {
        ...invoice.lines,
        data: [{ ...invoice.lines.data[0], type: 'invoiceitem' }],
      },
    });
  });

  it('rejects proration, non-unit quantity and a line on another invoice', () => {
    const invoice = acaciaInvoice();
    for (const lineChange of [
      { proration: true },
      { quantity: 2 },
      { currency: 'eur' },
      { invoice: 'in_other' },
      { price: { id: 'price_unknown' } },
      { price: null },
    ]) {
      rejects({
        ...invoice,
        lines: { ...invoice.lines, data: [{ ...invoice.lines.data[0], ...lineChange }] },
      });
    }
  });

  it('rejects Basil proration, invoice item and unknown Price', () => {
    const invoice = basilInvoice();
    const line = invoice.lines.data[0];
    rejects({
      ...invoice,
      lines: { ...invoice.lines, data: [{
        ...line,
        parent: {
          type: 'subscription_item_details',
          subscription_item_details: { subscription: 'sub_owned', proration: true },
        },
      }] },
    });
    rejects({
      ...invoice,
      lines: { ...invoice.lines, data: [{
        ...line,
        parent: { type: 'invoice_item_details' },
      }] },
    });
    rejects({
      ...invoice,
      lines: { ...invoice.lines, data: [{
        ...line,
        pricing: { type: 'price_details', price_details: { price: 'price_unknown' } },
      }] },
    });
    rejects({
      ...invoice,
      lines: { ...invoice.lines, data: [{ ...line, quantity_decimal: '1.5' }] },
    });
    rejects({
      ...invoice,
      lines: { ...invoice.lines, data: [{
        ...line,
        pricing: { type: 'price_details', price_details: { price: null } },
      }] },
    });
  });

  it('never includes supplied identifiers in a reconciliation error', () => {
    const snapshot = acaciaInvoice();
    try {
      deriveBilledPlanFromPaidInvoice({ ...input, stripeCustomerId: 'cus_sensitive', snapshot });
      throw new Error('Expected a rejection');
    } catch (error) {
      expect((error as Error).message).toBe('Paid Stripe invoice requires manual reconciliation');
    }
  });
});
