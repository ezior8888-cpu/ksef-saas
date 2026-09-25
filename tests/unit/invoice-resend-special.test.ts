import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  update: vi.fn(),
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
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
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

/**
 * „Wyślij ponownie” odtwarza fakturę z bazy — bez danych korekty/zaliczki,
 * których tam nie ma. Dla KOR/ZAL/ROZ odmawiamy od razu, zanim status
 * przeskoczy na 'queued' i zanim powstanie job skazany na odmowę.
 */

const ID = '11111111-1111-4111-8111-111111111111';

function faktura(invoice_type: string | null, fa3Type = invoice_type ?? 'VAT') {
  return {
    id: ID,
    tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    internal_number: 'X 1',
    invoice_type,
    issue_date: '2026-09-25',
    sale_date: '2026-09-25',
    seller_data: { nip: '5260001246', name: 'S', address: { countryCode: 'PL', addressLine1: 'a', addressLine2: 'b' } },
    buyer_data: { nip: '5252241585', name: 'B', address: { countryCode: 'PL', addressLine1: 'a', addressLine2: 'b' } },
    payment_data: { currency: 'PLN', dueDate: '2026-10-09', method: 'transfer' },
    notes: null,
    net_total: 100,
    vat_total: 23,
    gross_total: 123,
    ksef_status: 'rejected',
    fa3_data: { type: fa3Type },
    invoice_line_items: [],
    tenants: { nip: '5260001246', ksef_credentials_encrypted: 'x' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('„Wyślij ponownie” dla dokumentów specjalnych', () => {
  it.each(['KOR', 'ZAL', 'ROZ'])('%s: odmowa od razu, bez joba i bez zmiany statusu', async (type) => {
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

  it('zwykła faktura VAT nadal idzie do kolejki', async () => {
    mocks.row = faktura('VAT');
    await resendInvoiceAction(ID);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
