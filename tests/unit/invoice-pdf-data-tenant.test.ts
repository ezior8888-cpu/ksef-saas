import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));

import { loadInvoiceForPdf } from '@/lib/pdf/invoice-data';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const ownTenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreignTenant = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockImplementation(() => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        mocks.eq(column, value);
        filters[column] = value;
        return query;
      },
      maybeSingle: async () => ({
        data: filters.id === invoiceId && filters.tenant_id === foreignTenant
          ? {
              id: invoiceId, tenant_id: foreignTenant, internal_number: 'FV/1',
              invoice_type: 'VAT', issue_date: '2026-09-27', sale_date: null,
              ksef_number: null, net_total: 100, vat_total: 23, gross_total: 123,
              notes: null, updated_at: null, pdf_storage_path: null,
              pdf_generated_at: null, seller_data: {}, buyer_data: {},
              payment_data: {}, invoice_line_items: [],
            }
          : null,
        error: null,
      }),
    };
    return query;
  });
});

it('nie zwraca obcej faktury nawet przy znanym ID i kliencie service-role', async () => {
  expect(await loadInvoiceForPdf(invoiceId, ownTenant)).toBeNull();
  expect(mocks.eq).toHaveBeenCalledWith('id', invoiceId);
  expect(mocks.eq).toHaveBeenCalledWith('tenant_id', ownTenant);
});

it('zwraca fakturę tylko dla jej organizacji', async () => {
  expect(await loadInvoiceForPdf(invoiceId, foreignTenant)).toMatchObject({
    tenantId: foreignTenant,
    invoiceId,
  });
});
