import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  enqueue: vi.fn(),
  status: 'rejected',
  filters: [] as Array<[string, unknown]>,
}));

vi.mock('@/lib/supabase/auth-context', () => ({
  requireUserAndActiveOrg: mocks.requireAuth,
  ActionAuthError: class ActionAuthError extends Error {},
}));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.enqueue }));
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/storage/r2', () => ({ downloadInvoiceXml: vi.fn() }));
vi.mock('@/lib/pdf/invoice-pdf', () => ({ generateInvoicePdf: vi.fn() }));
vi.mock('@/lib/pdf/invoice-data', () => ({ loadInvoiceForPdf: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendInvoiceEmail: vi.fn() }));

import { resendInvoiceAction } from '@/components/invoices/actions-detail';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.filters = [];
  mocks.status = 'rejected';
  mocks.requireAuth.mockImplementation(async () => {
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        mocks.filters.push([key, value]);
        return query;
      },
      maybeSingle: async () => ({ data: { ksef_status: mocks.status }, error: null }),
    };
    return { supabase: { from: () => query }, tenantId, user: { id: 'user-1' } };
  });
});

it('faktura zw odrzucona przez KSeF wymaga uzgodnienia; P_19A nie upoważnia do replay', async () => {
  expect(await resendInvoiceAction(invoiceId)).toMatchObject({
    success: false,
    error: expect.stringContaining('uzgodnić'),
  });
  expect(mocks.filters).toContainEqual(['tenant_id', tenantId]);
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
