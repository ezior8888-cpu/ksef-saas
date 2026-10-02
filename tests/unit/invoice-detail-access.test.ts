import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  generatePdf: vi.fn(),
  loadPdf: vi.fn(),
  sendEmail: vi.fn(),
  downloadXml: vi.fn(),
  logAudit: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/storage/r2', () => ({ downloadInvoiceXml: mocks.downloadXml }));
vi.mock('@/lib/pdf/invoice-pdf', () => ({
  generateInvoicePdf: mocks.generatePdf,
  verifyInvoicePdfDeliveryState: async () => null,
}));
vi.mock('@/lib/pdf/invoice-data', () => ({ loadInvoiceForPdf: mocks.loadPdf }));
vi.mock('@/lib/email/send', () => ({ sendInvoiceEmail: mocks.sendEmail }));
vi.mock('@/lib/supabase/auth-context', () => ({
  ActionAuthError: class ActionAuthError extends Error {},
  requireUserAndActiveOrg: mocks.requireAuth,
}));

import {
  downloadInvoiceXmlAction,
  emailInvoiceAction,
} from '@/components/invoices/actions-detail';
import { ActionAuthError } from '@/lib/supabase/auth-context';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreignTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        mocks.eq(table, column, value);
        return query;
      },
      maybeSingle: async () => ({
        data: table === 'invoices'
          ? { internal_number: 'FV/1', tenant_id: tenantId, xml_storage_path: `${tenantId}/invoice.xml` }
          : { sha256_hash: 'expected-hash' },
        error: null,
      }),
    };
    return query;
  });
  mocks.requireAuth.mockResolvedValue({
    supabase: { from: mocks.from },
    user: { id: 'user-a' },
    tenantId,
  });
  mocks.generatePdf.mockResolvedValue({
    success: true, pdf: Buffer.from('own-pdf'), filename: 'FV-1.pdf',
  });
  mocks.loadPdf.mockResolvedValue({
    tenantId,
    invoice: {
      internalNumber: 'FV/1', seller: { name: 'Testowy sprzedawca' },
      grossTotal: 123, payment: { dueDate: '2026-10-09' },
    },
  });
  mocks.sendEmail.mockResolvedValue({ sent: true });
  mocks.downloadXml.mockResolvedValue('<Faktura />');
});

describe('faktury: granica aktywnego członkostwa', () => {
  it.each([
    'Wymagana weryfikacja dwuetapowa',
    'Brak dostępu do aktywnej organizacji',
  ])('odmawia wysłania PDF przed użyciem service-role: %s', async (reason) => {
    mocks.requireAuth.mockRejectedValueOnce(new ActionAuthError(reason));

    expect(await emailInvoiceAction(invoiceId, 'attacker@example.test')).toEqual({
      success: false, error: reason,
    });
    expect(mocks.generatePdf).not.toHaveBeenCalled();
    expect(mocks.loadPdf).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('wiąże oba odczyty PDF ze zweryfikowanym tenantem', async () => {
    expect(await emailInvoiceAction(invoiceId, 'buyer@example.test')).toEqual({ success: true });
    expect(mocks.generatePdf).toHaveBeenCalledWith(invoiceId, tenantId);
    expect(mocks.loadPdf).toHaveBeenCalledWith(invoiceId, tenantId);
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, userId: 'user-a', action: 'invoice.emailed',
    }));
  });

  it('nie wysyła PDF, gdy loader zwróci rekord innej organizacji', async () => {
    mocks.loadPdf.mockResolvedValueOnce({ tenantId: foreignTenantId, invoice: {} });

    expect(await emailInvoiceAction(invoiceId, 'attacker@example.test')).toMatchObject({
      success: false,
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    'Wymagana weryfikacja dwuetapowa',
    'Brak dostępu do aktywnej organizacji',
  ])('odmawia pobrania XML przed odczytem i storage: %s', async (reason) => {
    mocks.requireAuth.mockRejectedValueOnce(new ActionAuthError(reason));

    expect(await downloadInvoiceXmlAction(invoiceId)).toEqual({
      success: false, error: reason,
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.downloadXml).not.toHaveBeenCalled();
  });

  it('pobiera XML tylko dla faktury aktywnej organizacji', async () => {
    expect(await downloadInvoiceXmlAction(invoiceId)).toMatchObject({
      success: true, xml: '<Faktura />',
    });
    expect(mocks.eq).toHaveBeenCalledWith('invoices', 'tenant_id', tenantId);
    expect(mocks.downloadXml).toHaveBeenCalledWith(
      `${tenantId}/invoice.xml`, 'expected-hash', tenantId,
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, userId: 'user-a', action: 'invoice.xml_downloaded',
    }));
  });
});
