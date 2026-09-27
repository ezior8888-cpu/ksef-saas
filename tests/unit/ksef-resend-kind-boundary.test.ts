import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
  sendJobEvent: vi.fn(),
  logAudit: vi.fn(),
  row: { ksef_status: 'rejected', invoice_kind: 'correction' },
}));

vi.mock('@/lib/supabase/auth-context', () => ({
  ActionAuthError: class ActionAuthError extends Error {},
  requireUserAndActiveOrg: mocks.requireAuth,
}));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.sendJobEvent }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/storage/r2', () => ({ downloadInvoiceXml: vi.fn() }));
vi.mock('@/lib/pdf/invoice-pdf', () => ({ generateInvoicePdf: vi.fn() }));
vi.mock('@/lib/pdf/invoice-data', () => ({ loadInvoiceForPdf: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendInvoiceEmail: vi.fn() }));

import { resendInvoiceAction } from '@/components/invoices/actions-detail';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.row = { ksef_status: 'rejected', invoice_kind: 'correction' };
  const query = {
    select: (columns: string) => { mocks.select(columns); return query; },
    eq: (key: string, value: unknown) => { mocks.eq(key, value); return query; },
    maybeSingle: async () => ({ data: mocks.row, error: null }),
    update: (patch: unknown) => { mocks.update(patch); return query; },
  };
  mocks.from.mockReturnValue(query);
  mocks.requireAuth.mockResolvedValue({
    supabase: { from: mocks.from },
    user: { id: 'fixture-user' },
    tenantId,
  });
});

it.each([
  ['correction', 'rejected'],
  ['advance', 'rejected'],
  ['final', 'rejected'],
  ['regular', 'failed'],
])('blocks historical %s/%s resend before any job or status update', async (kind, status) => {
  mocks.row = { ksef_status: status, invoice_kind: kind };

  const result = await resendInvoiceAction(invoiceId);

  expect(result).toMatchObject({ success: false, error: expect.stringContaining('uzgodnić') });
  expect(mocks.select).toHaveBeenCalledWith('ksef_status');
  expect(mocks.eq).toHaveBeenCalledWith('id', invoiceId);
  expect(mocks.eq).toHaveBeenCalledWith('tenant_id', tenantId);
  expect(mocks.sendJobEvent).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.logAudit).not.toHaveBeenCalled();
});
