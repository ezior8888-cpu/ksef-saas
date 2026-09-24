import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Invoice } from '@/types/invoice';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));

import { insertSelfInvoice } from '@/lib/billing/self-invoice';

const firstStripeInvoiceId = 'in_firstABCDEFGH';
const secondStripeInvoiceId = 'in_secondABCDEFGH';
const collisionError = 'Self-invoice number collision requires reconciliation';

function invoiceFor(stripeInvoiceId: string): Invoice {
  return {
    internalNumber: 'FF/2026/09/ABCDEFGH',
    type: 'VAT',
    issueDate: '2026-09-24',
    seller: {
      nip: '1234567890',
      name: 'Operator',
      address: { countryCode: 'PL', addressLine1: 'Ulica 1', addressLine2: '00-001' },
    },
    buyer: {
      nip: '9876543210',
      name: 'Nabywca',
      address: { countryCode: 'PL', addressLine1: 'Ulica 2', addressLine2: '00-002' },
    },
    lines: [{
      ordinal: 1,
      name: 'FaktFlow — subskrypcja miesięczna',
      unit: 'usł.',
      quantity: 1,
      unitPriceNet: 47.97,
      netAmount: 47.97,
      vatRate: '23',
      vatAmount: 11.03,
      grossAmount: 59,
    }],
    netTotal: 47.97,
    vatTotal: 11.03,
    grossTotal: 59,
    payment: { amountDue: 59, currency: 'PLN', dueDate: '2026-09-24', method: 'card' },
    notes: 'Faktura za subskrypcję FaktFlow. Płatność Stripe: ' + stripeInvoiceId + '.',
  };
}

let storedInvoice: {
  id: string;
  notes: string | null;
  fa3_data: Record<string, unknown> | null;
  gross_total: number | null;
  buyer_nip: string | null;
};
let storedLines: Array<{
  gross_amount: number;
  net_amount: number;
  vat_amount: number;
  quantity: number;
  name: string;
  vat_rate: string;
  unit_price_net: number;
  unit: string;
}>;

beforeEach(() => {
  vi.clearAllMocks();
  const original = invoiceFor(firstStripeInvoiceId);
  storedInvoice = {
    id: 'existing-vat-invoice',
    notes: original.notes ?? null,
    fa3_data: original as unknown as Record<string, unknown>,
    gross_total: original.grossTotal,
    buyer_nip: original.buyer.nip ?? null,
  };
  storedLines = [{
    gross_amount: original.lines[0].grossAmount,
    net_amount: original.lines[0].netAmount,
    vat_amount: original.lines[0].vatAmount,
    quantity: original.lines[0].quantity,
    name: original.lines[0].name,
    vat_rate: original.lines[0].vatRate,
    unit_price_net: original.lines[0].unitPriceNet,
    unit: original.lines[0].unit,
  }];
  mocks.from.mockImplementation((table: string) => {
    if (table === 'invoices') {
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { code: '23505', message: 'duplicate key' },
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: storedInvoice, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === 'invoice_line_items') {
      return {
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: storedLines, error: null }),
          }),
        }),
      };
    }
    throw new Error('Unexpected table: ' + table);
  });
});

describe('self-invoice number collision guard', () => {
  it('reuses a complete invoice for the exact same full Stripe invoice ID', async () => {
    await expect(insertSelfInvoice(
      invoiceFor(firstStripeInvoiceId), 'operator-tenant', firstStripeInvoiceId,
    )).resolves.toEqual({
      invoiceId: 'existing-vat-invoice',
      internalNumber: 'FF/2026/09/ABCDEFGH',
    });
  });

  it('rejects two different Stripe IDs with the same eight-character suffix', async () => {
    await expect(insertSelfInvoice(
      invoiceFor(secondStripeInvoiceId), 'operator-tenant', secondStripeInvoiceId,
    )).rejects.toThrow(collisionError);
    expect(mocks.from).not.toHaveBeenCalledWith('invoice_line_items');
  });

  it('rejects a missing or conflicting stored full ID', async () => {
    storedInvoice.fa3_data = null;
    await expect(insertSelfInvoice(
      invoiceFor(firstStripeInvoiceId), 'operator-tenant', firstStripeInvoiceId,
    )).rejects.toThrow(collisionError);

    storedInvoice.fa3_data = invoiceFor(firstStripeInvoiceId) as unknown as Record<string, unknown>;
    storedInvoice.notes = null;
    await expect(insertSelfInvoice(
      invoiceFor(firstStripeInvoiceId), 'operator-tenant', firstStripeInvoiceId,
    )).rejects.toThrow(collisionError);
  });

  it('rejects a matching ID with a different amount or buyer', async () => {
    storedInvoice.gross_total = 60;
    await expect(insertSelfInvoice(
      invoiceFor(firstStripeInvoiceId), 'operator-tenant', firstStripeInvoiceId,
    )).rejects.toThrow(collisionError);

    storedInvoice.gross_total = 59;
    storedInvoice.buyer_nip = '1111111111';
    await expect(insertSelfInvoice(
      invoiceFor(firstStripeInvoiceId), 'operator-tenant', firstStripeInvoiceId,
    )).rejects.toThrow(collisionError);
  });

  it('rejects an incomplete existing invoice without its line item', async () => {
    storedLines = [];
    await expect(insertSelfInvoice(
      invoiceFor(firstStripeInvoiceId), 'operator-tenant', firstStripeInvoiceId,
    )).rejects.toThrow(collisionError);
  });

  it('rejects a saved line with a different tax rate, unit price or unit', async () => {
    for (const change of [
      { vat_rate: '8' },
      { unit_price_net: 48 },
      { unit: 'szt.' },
    ]) {
      const original = { ...storedLines[0] };
      storedLines[0] = { ...original, ...change };
      await expect(insertSelfInvoice(
        invoiceFor(firstStripeInvoiceId), 'operator-tenant', firstStripeInvoiceId,
      )).rejects.toThrow(collisionError);
      storedLines[0] = original;
    }
  });
});
