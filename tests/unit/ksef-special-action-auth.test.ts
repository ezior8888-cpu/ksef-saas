import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createClient: vi.fn(),
  enqueue: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/auth-context', () => ({
  requireUserAndActiveOrg: mocks.requireAuth,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));
vi.mock('@/lib/invoices/ksef-submit-enqueue', () => ({
  enqueueKsefSubmitAfterDraft: mocks.enqueue,
}));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/xml/invoice-calculator', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/xml/invoice-calculator')>(),
  // Fixture NIPs are deliberately fictional.
  validateNipChecksum: () => true,
}));

import {
  saveAdvanceAction,
  saveAndSendAdvanceAction,
} from '@/components/invoices/advance-actions';
import {
  saveFinalAction,
  saveAndSendFinalAction,
} from '@/components/invoices/final-actions';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KSEF_ENV', 'test');
});

afterEach(() => vi.unstubAllEnvs());

describe('special invoice actions', () => {
  it.each([
    ['advance draft', () => saveAdvanceAction({})],
    ['advance send', () => saveAndSendAdvanceAction({})],
    ['final draft', () => saveFinalAction({})],
    ['final send', () => saveAndSendFinalAction({})],
  ])('denies %s before any tenant read, write or enqueue when MFA is pending', async (_label, action) => {
    mocks.requireAuth.mockRejectedValueOnce(new Error('Wymagana weryfikacja dwuetapowa'));
    const result = await action();

    expect(result).toMatchObject({
      success: false,
      error: 'Wymagana weryfikacja dwuetapowa',
    });
    expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

const tenantId = '11111111-1111-4111-8111-111111111111';
const advanceId = '22222222-2222-4222-8222-222222222222';
const invoiceId = '33333333-3333-4333-8333-333333333333';
const address = { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' };
const seller = { nip: '1234567890', name: 'Fixture seller', address };
const buyer = { type: 'b2b' as const, idType: 'nip' as const, nip: '1234567890', name: 'Fixture buyer', address };
const common = {
  internalNumber: 'SPEC/2026/1', issueDate: '2026-09-28', paymentMethod: 'transfer' as const,
  paymentDueDate: '2026-10-05', bankAccount: '1'.repeat(26), seller, buyer,
};
const advanceInput = {
  ...common, invoiceType: 'advance' as const, advanceAmount: 123,
  totalContractAmount: 1000, vatRate: '23' as const, description: 'Testowa zaliczka na usługę',
};
const finalInput = {
  ...common, invoiceType: 'final' as const, advanceInvoiceIds: [advanceId],
  totalAdvances: 123,
  lines: [{ name: 'Testowa usługa', unit: 'szt', quantity: 1, unitPriceNet: 1000, vatRate: '23' as const }],
};

type Query = { table: string; operation: 'select' | 'insert' | 'delete'; payload?: unknown };
let tenantRow: Record<string, unknown>;
let queries: Query[];

function from(table: string) {
  const query: Query = { table, operation: 'select' };
  queries.push(query);
  const result = () => {
    if (table === 'tenants') return { data: tenantRow, error: null };
    if (table === 'invoices' && query.operation === 'insert') {
      return { data: { id: invoiceId }, error: null };
    }
    if (table === 'invoices') {
      return { data: [{ id: advanceId, internal_number: 'ZAL/2026/1',
        ksef_number: 'KSEF-TEST-1', issue_date: '2026-09-20', advance_amount: 123,
        gross_total: 123, invoice_kind: 'advance' }], error: null };
    }
    return { data: null, error: null };
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    insert: (payload: unknown) => { query.operation = 'insert'; query.payload = payload; return chain; },
    delete: () => { query.operation = 'delete'; return chain; },
    single: async () => result(),
    maybeSingle: async () => result(),
    then: <T,>(resolve: (value: ReturnType<typeof result>) => T) => Promise.resolve(result()).then(resolve),
  };
  return chain;
}

describe('ZAL/ROZ seller authority', () => {
  beforeEach(() => {
    tenantRow = { id: tenantId, nip: seller.nip, name: seller.name, address_json: address };
    queries = [];
    mocks.requireAuth.mockResolvedValue({
      supabase: { from }, user: { id: 'fixture-user' }, tenantId, role: 'member',
    });
    mocks.enqueue.mockResolvedValue({ ok: true });
  });

  it.each([
    ['advance draft', () => saveAdvanceAction(advanceInput)],
    ['advance send', () => saveAndSendAdvanceAction(advanceInput)],
    ['final draft', () => saveFinalAction(finalInput)],
    ['final send', () => saveAndSendFinalAction(finalInput)],
  ])('uses the server tenant seller in %s', async (label, action) => {
    const result = await action();
    expect(result).toMatchObject({ success: true, invoiceId });
    const inserted = queries.find((q) => q.table === 'invoices' && q.operation === 'insert');
    expect(inserted?.payload).toMatchObject({
      seller_nip: seller.nip,
      seller_data: { nip: seller.nip, name: seller.name, address },
      fa3_data: { seller: { nip: seller.nip, name: seller.name, address } },
    });
    if (label.endsWith('send')) {
      expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        invoice: expect.objectContaining({ seller: expect.objectContaining({ nip: seller.nip, address }) }),
        [label.startsWith('advance') ? 'advanceData' : 'finalData']:
          expect.objectContaining({ seller: expect.objectContaining({ nip: seller.nip, address }) }),
      }));
    } else {
      expect(mocks.enqueue).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['NIP', { ...seller, nip: '9999999999' }],
    ['name', { ...seller, name: 'Other seller' }],
    ['address', { ...seller, address: { ...address, addressLine1: 'ul. Obca 2' } }],
  ])('rejects forged %s before writing an advance or final invoice', async (_field, forged) => {
    for (const [action, payload] of [
      [saveAndSendAdvanceAction, { ...advanceInput, seller: forged }],
      [saveAndSendFinalAction, { ...finalInput, seller: forged }],
    ] as const) {
      queries = [];
      const result = await action(payload);
      expect(result).toMatchObject({ success: false });
      expect(queries.some((q) => q.table === 'invoices')).toBe(false);
      expect(mocks.enqueue).not.toHaveBeenCalled();
    }
  });

  it('rejects an incomplete or malformed tenant address without an XML placeholder', async () => {
    for (const malformed of [{ countryCode: 'PL', addressLine1: 'ul. Testowa 1' }, 42]) {
      tenantRow.address_json = malformed;
      queries = [];
      const result = await saveAndSendAdvanceAction(advanceInput);
      expect(result).toMatchObject({ success: false });
      expect(queries.some((q) => q.table === 'invoices')).toBe(false);
      expect(mocks.enqueue).not.toHaveBeenCalled();
    }
  });
});
