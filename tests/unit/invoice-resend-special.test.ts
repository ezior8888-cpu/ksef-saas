import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice } from '@/types/invoice';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  requireAuth: vi.fn(),
  row: null as Record<string, unknown> | null,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.send }));
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerification: vi.fn(async () => undefined),
  KsefNotVerifiedError: class KsefNotVerifiedError extends Error {},
}));
vi.mock('@/lib/storage/r2', () => ({ downloadInvoiceXml: vi.fn() }));
vi.mock('@/lib/inngest/error-message', () => ({ formatInngestSendError: (e: unknown) => String(e) }));
vi.mock('@/lib/pdf/invoice-pdf', () => ({ generateInvoicePdf: vi.fn() }));
vi.mock('@/lib/pdf/invoice-data', () => ({ loadInvoiceForPdf: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendInvoiceEmail: vi.fn() }));
vi.mock('@/lib/supabase/active-org', () => ({ getActiveOrgIdFromCookies: vi.fn() }));
vi.mock('@/lib/supabase/auth-context', () => ({
  ActionAuthError: class ActionAuthError extends Error {},
  requireUserAndActiveOrg: mocks.requireAuth,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
    from: () => {
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          mocks.eq(column, value);
          return q;
        },
        single: async () => ({ data: mocks.row, error: null }),
        update: (patch: unknown) => {
          mocks.update(patch);
          return q;
        },
        then: (ok: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok),
      };
      return q;
    },
  }),
}));

import { resendInvoiceAction } from '@/components/invoices/actions-detail';
import { ActionAuthError } from '@/lib/supabase/auth-context';

/**
 * „Wyślij ponownie” odtwarza fakturę z bazy — bez danych korekty/zaliczki,
 * których tam nie ma. Dla KOR/ZAL/ROZ odmawiamy od razu, zanim status
 * przeskoczy na 'queued' i zanim powstanie job skazany na odmowę.
 */

const ID = '11111111-1111-4111-8111-111111111111';

const VAT_SNAPSHOT: Invoice = {
  internalNumber: 'FV 1/2026',
  type: 'VAT',
  issueDate: '2026-09-25',
  saleDate: '2026-09-25',
  seller: {
    nip: '1234567890',
    name: 'Sprzedawca Testowy',
    address: { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' },
  },
  buyer: {
    nip: '1111111111',
    name: 'Nabywca Testowy',
    address: { countryCode: 'PL', addressLine1: 'ul. Przykładowa 2', addressLine2: '00-002 Warszawa' },
  },
  lines: [{
    ordinal: 1,
    name: 'Usługa testowa',
    classificationCode: 'PKWiU 62.01.11.0',
    unit: 'usł.',
    quantity: 1,
    unitPriceNet: 100,
    netAmount: 100,
    vatRate: '23',
    vatAmount: 23,
    grossAmount: 123,
  }],
  netTotal: 100,
  vatTotal: 23,
  grossTotal: 123,
  payment: { amountDue: 123, currency: 'PLN', dueDate: '2026-10-09', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
  annotations: { splitPayment: 2 },
  notes: 'Warunki zapisane w kopii faktury',
};

function faktura(invoice_type: Invoice['type'] | null, fa3Type: Invoice['type'] = invoice_type ?? 'VAT') {
  const snapshot = { ...VAT_SNAPSHOT, type: fa3Type };
  return {
    id: ID,
    tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    internal_number: VAT_SNAPSHOT.internalNumber,
    invoice_kind: 'regular',
    invoice_type,
    issue_date: VAT_SNAPSHOT.issueDate,
    sale_date: VAT_SNAPSHOT.saleDate,
    seller_data: VAT_SNAPSHOT.seller,
    buyer_data: VAT_SNAPSHOT.buyer,
    payment_data: VAT_SNAPSHOT.payment,
    notes: VAT_SNAPSHOT.notes,
    net_total: VAT_SNAPSHOT.netTotal,
    vat_total: VAT_SNAPSHOT.vatTotal,
    gross_total: VAT_SNAPSHOT.grossTotal,
    ksef_status: 'rejected',
    fa3_data: snapshot,
    invoice_line_items: [{ ordinal: 1, name: 'Usługa testowa', unit: 'usł.', quantity: 1, unit_price_net: 100, vat_rate: '23', net_amount: 100, vat_amount: 23, gross_amount: 123 }],
    tenants: { nip: VAT_SNAPSHOT.seller.nip, ksef_credentials_encrypted: 'x' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KSEF_ENV', 'test');
  mocks.requireAuth.mockImplementation(async () => ({
    supabase: await (await import('@/lib/supabase/server')).createClient(),
    user: { id: 'u' },
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe('„Wyślij ponownie” dla dokumentów specjalnych', () => {
  it.each([
    'Wymagana weryfikacja dwuetapowa',
    'Brak dostępu do aktywnej organizacji',
  ])('odmawia przed odczytem i jobem: %s', async (reason) => {
    mocks.row = faktura('VAT');
    mocks.requireAuth.mockRejectedValueOnce(new ActionAuthError(reason));

    expect(await resendInvoiceAction(ID)).toEqual({
      success: false,
      error: reason,
    });
    expect(mocks.eq).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(['KOR', 'ZAL', 'ROZ'] as const)('%s: odmowa od razu, bez joba i bez zmiany statusu', async (type) => {
    mocks.row = faktura(type);
    const wynik = await resendInvoiceAction(ID);
    expect(wynik.success).toBe(false);
    expect(wynik.success === false && wynik.error).toMatch(/Wystaw dokument ponownie z formularza/);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('typ z kopii fa3_data liczy się, gdy kolumna jest pusta', async () => {
    mocks.row = faktura(null, 'KOR');
    expect((await resendInvoiceAction(ID)).success).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('nie raportuje sukcesu przy rozbieżnym typie kolumny i zapisanej kopii', async () => {
    mocks.row = faktura('VAT', 'KOR');
    const wynik = await resendInvoiceAction(ID);
    expect(wynik.success).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('zwykła faktura VAT trafia do kolejki z dokładną kopią, w tym classificationCode', async () => {
    const row = faktura('VAT');
    mocks.row = row;
    expect(await resendInvoiceAction(ID)).toEqual({ success: true });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const event = mocks.send.mock.calls[0]?.[0];
    expect(event?.data?.invoice).toBe(row.fa3_data);
    expect(event?.data?.invoice).toEqual(VAT_SNAPSHOT);
    expect(event?.data?.invoice?.lines[0]?.classificationCode).toBe('PKWiU 62.01.11.0');
    expect(event?.data?.environment).toBe('test');
    expect(mocks.eq).toHaveBeenCalledWith('tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it.each([
    ['kwota', { gross_total: 124 }],
    ['nabywca', { buyer_data: { ...VAT_SNAPSHOT.buyer, name: 'Inny nabywca' } }],
  ])('odmawia przy rozbieżności %s między kolumnami i kopią', async (_label, changed) => {
    mocks.row = { ...faktura('VAT'), ...changed };
    const wynik = await resendInvoiceAction(ID);
    expect(wynik).toMatchObject({ success: false, error: expect.stringContaining('niekompletne lub niespójne') });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
