import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), sendJobEvent: vi.fn(), requireKsefVerification: vi.fn(),
  logAudit: vi.fn(), requireAuth: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/auth-context', () => ({
  ActionAuthError: class ActionAuthError extends Error {},
  requireUserAndActiveOrg: mocks.requireAuth,
}));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.sendJobEvent }));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  KsefNotVerifiedError: class extends Error {},
  requireKsefVerification: mocks.requireKsefVerification,
}));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/storage/r2', () => ({ downloadInvoiceXml: vi.fn() }));
vi.mock('@/lib/pdf/invoice-pdf', () => ({ generateInvoicePdf: vi.fn() }));
vi.mock('@/lib/pdf/invoice-data', () => ({ loadInvoiceForPdf: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendInvoiceEmail: vi.fn() }));

import { resendInvoiceAction } from '@/components/invoices/actions-detail';
import { finalizeInvoice } from '@/lib/xml/invoice-calculator';
import type { Invoice } from '@/types/invoice';

const VAT_SNAPSHOT = JSON.parse(JSON.stringify(finalizeInvoice({
  internalNumber: 'FV 1/2026',
  type: 'VAT',
  issueDate: '2026-09-25',
  saleDate: '2026-09-25',
  seller: {
    nip: '1234567890', name: 'Sprzedawca',
    address: { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' },
  },
  buyer: {
    nip: '1111111111', name: 'Nabywca',
    address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' },
  },
  lines: [{
    ordinal: 1, name: 'Usługa programistyczna', classificationCode: '62.01',
    unit: 'usł.', quantity: 1, unitPriceNet: 100, vatRate: '23',
  }],
  payment: { currency: 'PLN', dueDate: '2026-10-09', method: 'transfer' },
  notes: 'Zakres prac za wrzesień',
}))) as Invoice;

let invoiceKind: string;
let invoiceType: 'VAT' | 'KOR' | 'ZAL' | 'ROZ';
let invoiceStatus: string;
const select = vi.fn();
const from = vi.fn(() => {
  const chain = {
    select: (...args: unknown[]) => { select(...args); return chain; },
    eq: () => chain,
    is: () => chain,
    single: async () => ({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        tenant_id: '22222222-2222-4222-8222-222222222222',
        invoice_kind: invoiceKind,
        invoice_type: invoiceType,
        internal_number: VAT_SNAPSHOT.internalNumber,
        issue_date: VAT_SNAPSHOT.issueDate,
        sale_date: VAT_SNAPSHOT.saleDate,
        seller_data: VAT_SNAPSHOT.seller,
        buyer_data: VAT_SNAPSHOT.buyer,
        payment_data: VAT_SNAPSHOT.payment,
        notes: VAT_SNAPSHOT.notes,
        net_total: VAT_SNAPSHOT.netTotal,
        vat_total: VAT_SNAPSHOT.vatTotal,
        gross_total: VAT_SNAPSHOT.grossTotal,
        fa3_data: invoiceType === 'VAT' ? VAT_SNAPSHOT : { type: invoiceType },
        invoice_line_items: VAT_SNAPSHOT.lines,
        ksef_status: invoiceStatus,
        tenants: { nip: '1234567890', ksef_credentials_encrypted: 'fixture' },
      },
      error: null,
    }),
    maybeSingle: async () => ({
      data: { ksef_status: invoiceStatus },
      error: null,
    }),
    update: () => chain,
    then: (ok: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok),
  };
  return chain;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KSEF_ENV', 'test');
  invoiceKind = 'correction';
  invoiceType = 'KOR';
  invoiceStatus = 'rejected';
  mocks.createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } } }) },
    from,
  });
  mocks.requireAuth.mockImplementation(async () => ({
    supabase: await mocks.createClient(),
    user: { id: 'fixture-user' },
    tenantId: '22222222-2222-4222-8222-222222222222',
  }));
});

afterEach(() => vi.unstubAllEnvs());

it.each(['correction', 'advance', 'final'])(
  'blocks generic VAT resend of a rejected %s invoice before enqueue',
  async (kind) => {
    invoiceKind = kind;
    invoiceType = kind === 'correction' ? 'KOR' : kind === 'advance' ? 'ZAL' : 'ROZ';
    const result = await resendInvoiceAction('11111111-1111-4111-8111-111111111111');
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('uzgodnić') });
    expect(select.mock.calls[0]?.[0]).toContain('ksef_status');
    expect(mocks.requireKsefVerification).not.toHaveBeenCalled();
    expect(mocks.sendJobEvent).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  },
);

it('blocks historical ordinary VAT resend until it is reconciled', async () => {
  invoiceKind = 'regular';
  invoiceType = 'VAT';
  const result = await resendInvoiceAction('11111111-1111-4111-8111-111111111111');
  expect(result).toMatchObject({ success: false, error: expect.stringContaining('uzgodnić') });
  expect(mocks.requireKsefVerification).not.toHaveBeenCalled();
  expect(mocks.sendJobEvent).not.toHaveBeenCalled();
});
