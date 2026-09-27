import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  row: { ksef_status: 'failed' } as { ksef_status: string } | null,
  eq: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/lib/supabase/auth-context', () => ({
  requireUserAndActiveOrg: mocks.requireAuth,
  ActionAuthError: class ActionAuthError extends Error {},
}));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.send }));
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/storage/r2', () => ({ downloadInvoiceXml: vi.fn() }));
vi.mock('@/lib/pdf/invoice-pdf', () => ({ generateInvoicePdf: vi.fn() }));
vi.mock('@/lib/pdf/invoice-data', () => ({ loadInvoiceForPdf: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendInvoiceEmail: vi.fn() }));

import { resendInvoiceAction } from '@/components/invoices/actions-detail';
import { ActionAuthError } from '@/lib/supabase/auth-context';

const INVOICE_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.row = { ksef_status: 'failed' };
  mocks.requireAuth.mockImplementation(async () => {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        mocks.eq(column, value);
        return query;
      },
      maybeSingle: async () => ({ data: mocks.row, error: null }),
    };
    return {
      supabase: { from: () => query },
      tenantId: TENANT_ID,
      user: { id: 'user' },
    };
  });
});

describe('historical KSeF resend boundary', () => {
  it.each(['failed', 'rejected'])('blocks %s even without a submission timestamp', async (status) => {
    mocks.row = { ksef_status: status };
    expect(await resendInvoiceAction(INVOICE_ID)).toMatchObject({
      success: false,
      error: expect.stringContaining('uzgodnić'),
    });
    expect(mocks.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not access the invoice or enqueue when MFA or membership fails', async () => {
    mocks.requireAuth.mockRejectedValueOnce(new ActionAuthError('Wymagana weryfikacja dwuetapowa'));
    expect(await resendInvoiceAction(INVOICE_ID)).toEqual({
      success: false,
      error: 'Wymagana weryfikacja dwuetapowa',
    });
    expect(mocks.eq).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not disclose a foreign invoice or publish a job', async () => {
    mocks.row = null;
    expect(await resendInvoiceAction(INVOICE_ID)).toMatchObject({
      success: false,
      error: 'Nie można znaleźć faktury w tej organizacji.',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects replay from other statuses before publishing', async () => {
    mocks.row = { ksef_status: 'accepted' };
    expect((await resendInvoiceAction(INVOICE_ID)).success).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not disclose an unexpected DB error to the caller', async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error('PRIVATE-DB-DIAGNOSTIC'));
    expect(await resendInvoiceAction(INVOICE_ID)).toEqual({
      success: false,
      error: 'Nie można sprawdzić możliwości ponownej wysyłki. Spróbuj później.',
    });
  });
});
