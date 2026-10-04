import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Invoice } from '@/types/invoice';

/**
 * K1 z rewizji 03.10.2026: numer faktury za abonament nadaje baza
 * (`create_billing_vat_invoice`, 00110, AUD-69), więc draft z
 * `buildSelfInvoiceDraft` ma pusty `internalNumber`. `insertSelfInvoice`
 * porównywał numer zwrócony przez RPC z pustym numerem draftu i rzucał
 * „invalid result” PO zacommitowanej transakcji — faktura istniała w bazie,
 * zlecenie KSeF nigdy nie wychodziło, ponowienie kończyło się „manual
 * reconciliation required”.
 *
 * Reguła po naprawie:
 *   - draft bez numeru + nowa faktura → numer musi mieć format bazy
 *     `FF/RRRR/MM/NNNN`,
 *   - draft bez numeru + faktura istniejąca → numer z bazy jest źródłem prawdy
 *     (także w dawnym formacie sprzed 00110),
 *   - draft z numerem (dawna ścieżka) → numer musi się zgadzać dokładnie.
 */

const OPERATOR = '33333333-3333-4333-8333-333333333333';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const PAYMENT = '11111111-1111-4111-8111-111111111111';
const STRIPE_INVOICE = 'in_1ABCDEFGHIJKL';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import { buildSelfInvoiceDraft, insertSelfInvoice } from '@/lib/billing/self-invoice';

function tenantReads() {
  mocks.from.mockImplementation((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: table === 'tenants'
            ? { id: OPERATOR, nip: '1234567890', name: 'Firma Testowa', address_json: null }
            : null,
          error: null,
        }),
      }),
    }),
  }));
}

function rpcReturns(internalNumber: string, created: boolean) {
  mocks.rpc.mockResolvedValue({
    data: [{ invoice_id: 'vat-invoice', internal_number: internalNumber, created }],
    error: null,
  });
}

async function productionDraft(): Promise<Invoice> {
  const draft = await buildSelfInvoiceDraft(CUSTOMER, {
    grossCents: 2999,
    paidAt: '2026-10-02T10:00:00.000Z',
    stripeInvoiceId: STRIPE_INVOICE,
    plan: 'monthly',
  });
  if (!draft) throw new Error('draft nie powstał');
  return draft.invoice;
}

function insert(invoice: Invoice) {
  return insertSelfInvoice(invoice, OPERATOR, STRIPE_INVOICE, PAYMENT, CUSTOMER);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('FAKTFLOW_OPERATOR_TENANT_ID', OPERATOR);
  tenantReads();
});

describe('faktura za abonament: numer nadany przez bazę (K1, AUD-69)', () => {
  it('draft z produkcyjnego buildera ma pusty numer, a 29,99 zł rozbija się na 24,38 + 5,61', async () => {
    const invoice = await productionDraft();
    expect(invoice.internalNumber).toBe('');
    expect(invoice.netTotal).toBe(24.38);
    expect(invoice.vatTotal).toBe(5.61);
    expect(invoice.grossTotal).toBe(29.99);
  });

  it('nowa faktura: przyjmuje numer FF/RRRR/MM/NNNN z RPC zamiast odrzucać go po commicie', async () => {
    const invoice = await productionDraft();
    rpcReturns('FF/2026/10/0001', true);

    await expect(insert(invoice)).resolves.toEqual({
      invoiceId: 'vat-invoice',
      internalNumber: 'FF/2026/10/0001',
      created: true,
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it('istniejąca faktura (created=false): numer z bazy jest źródłem prawdy, także w dawnym formacie', async () => {
    const invoice = await productionDraft();
    rpcReturns('FF/2026/09/ABCDEFGH', false);

    await expect(insert(invoice)).resolves.toEqual({
      invoiceId: 'vat-invoice',
      internalNumber: 'FF/2026/09/ABCDEFGH',
      created: false,
    });
  });

  it.each(['', 'other-number', 'FF/2026/10/1', 'FF/2026/10/00001', 'ff/2026/10/0001'])(
    'nowa faktura z numerem spoza formatu bazy (%j) nadal jest odrzucana',
    async (returned) => {
      const invoice = await productionDraft();
      rpcReturns(returned, true);

      await expect(insert(invoice)).rejects.toThrow('invalid result');
    },
  );

  it('draft z własnym numerem (dawna ścieżka) wymaga dokładnej zgodności z RPC', async () => {
    const invoice = { ...(await productionDraft()), internalNumber: 'FF/2026/09/ABCDEFGH' };

    rpcReturns('FF/2026/09/ABCDEFGH', true);
    await expect(insert(invoice)).resolves.toMatchObject({ internalNumber: 'FF/2026/09/ABCDEFGH' });

    rpcReturns('FF/2026/10/0001', true);
    await expect(insert(invoice)).rejects.toThrow('invalid result');
  });
});
