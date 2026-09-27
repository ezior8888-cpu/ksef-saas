import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
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
        update: () => q,
        then: (ok: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok),
      };
      return q;
    },
  }),
}));

import { resendInvoiceAction } from '@/components/invoices/actions-detail';
import { generateFA3Xml } from '@/lib/xml/fa3-generator';
import type { Invoice } from '@/types/invoice';

/**
 * „Wyślij ponownie” składa fakturę z bazy pole po polu. Podstawa zwolnienia
 * z VAT (P_19A) jest tylko w snapshocie `fa3_data.annotations` — bez niej
 * faktura „zw” odrzucona albo nieudana nie dałaby się wysłać drugi raz.
 */

const ID = '11111111-1111-4111-8111-111111111111';
const PODSTAWA = 'art. 113 ust. 1 ustawy o VAT';

const seller = {
  nip: '5260001246',
  name: 'Sprzedawca zwolniony',
  address: { countryCode: 'PL', addressLine1: 'ul. Prosta 1', addressLine2: '00-001 Warszawa' },
};
const buyer = {
  nip: '5252241585',
  name: 'Nabywca',
  address: { countryCode: 'PL', addressLine1: 'ul. Krzywa 2', addressLine2: '00-002 Warszawa' },
};
const payment = {
  currency: 'PLN',
  dueDate: '2026-10-09',
  method: 'transfer',
  bankAccount: 'PL61109010140000071219812874',
};
const linia = {
  ordinal: 1,
  name: 'Usługa zwolniona',
  unit: 'szt',
  quantity: 1,
  unit_price_net: 1500,
  vat_rate: 'zw',
  net_amount: 1500,
  vat_amount: 0,
  gross_amount: 1500,
};

function odrzuconaZw(annotations: Invoice['annotations']) {
  return {
    id: ID,
    tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    internal_number: 'FV 1/09/2026',
    invoice_type: 'VAT',
    issue_date: '2026-09-25',
    sale_date: '2026-09-25',
    seller_data: seller,
    buyer_data: buyer,
    payment_data: payment,
    notes: null,
    net_total: 1500,
    vat_total: 0,
    gross_total: 1500,
    ksef_status: 'rejected',
    fa3_data: { type: 'VAT', seller, buyer, payment, annotations },
    invoice_line_items: [linia],
    tenants: { nip: '5260001246', ksef_credentials_encrypted: 'x' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('„Wyślij ponownie” faktury ze stawką „zw”', () => {
  it('podstawa zwolnienia z zapisu trafia do kolejki i do XML (P_19A)', async () => {
    mocks.row = odrzuconaZw({ vatExemptionBasis: PODSTAWA });
    await expect(resendInvoiceAction(ID)).resolves.toMatchObject({ success: true });

    const invoice = mocks.send.mock.calls[0]![0].data.invoice as Invoice;
    expect(invoice.annotations).toEqual({ vatExemptionBasis: PODSTAWA });

    const xml = generateFA3Xml(invoice);
    expect(xml).toContain(`<P_19A>${PODSTAWA}</P_19A>`);
    expect(xml).not.toContain('<P_19N>');
  });
});
