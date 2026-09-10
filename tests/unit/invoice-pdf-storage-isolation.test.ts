import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), render: vi.fn(),
  exists: vi.fn(), download: vi.fn(), upload: vi.fn(),
}));
vi.mock('@/lib/pdf/invoice-data', () => ({
  loadInvoiceForPdf: mocks.load, saveInvoicePdfPath: mocks.save,
}));
vi.mock('@/lib/pdf/invoice-renderer', () => ({ renderInvoicePdf: mocks.render }));
vi.mock('@/lib/pdf/pdf-storage', () => ({
  buildInvoicePdfKey: (tenantId: string, invoiceId: string) => tenantId + '/2026/09/' + invoiceId + '.pdf',
  invoicePdfExists: mocks.exists, downloadInvoicePdf: mocks.download, uploadInvoicePdf: mocks.upload,
}));
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exists.mockResolvedValue(true);
  mocks.download.mockResolvedValue(Buffer.from('cached-private-document'));
  mocks.render.mockResolvedValue(Buffer.from('generated-own-document'));
  mocks.load.mockResolvedValue({
    invoice: { internalNumber: 'FV/1' }, tenantId: 'tenant-a', issueDate: '2026-09-09',
    pdfStoragePath: 'tenant-a/2026/09/invoice.pdf',
    pdfGeneratedAt: '2026-09-09T13:00:00Z', updatedAt: '2026-09-09T12:00:00Z',
  });
});

describe('PDF cache ownership', () => {
  it('regenerates an own invoice whose writable pdf_storage_path points to another tenant', async () => {
    mocks.load.mockResolvedValue({
      invoice: { internalNumber: 'FV/1' }, tenantId: 'tenant-a', issueDate: '2026-09-09',
      pdfStoragePath: 'tenant-b/2026/09/victim.pdf',
      pdfGeneratedAt: '2026-09-09T13:00:00Z', updatedAt: '2026-09-09T12:00:00Z',
    });
    const result = await generateInvoicePdf('invoice', 'tenant-a');
    expect(result).toMatchObject({ success: true, pdf: Buffer.from('generated-own-document') });
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledWith('tenant-a/2026/09/invoice.pdf', Buffer.from('generated-own-document'));
  });

  it('preserves a valid tenant cache hit with an explicit tenant argument', async () => {
    const result = await generateInvoicePdf('invoice', 'tenant-a');
    expect(result).toMatchObject({ success: true, pdf: Buffer.from('cached-private-document') });
    expect(mocks.download).toHaveBeenCalledWith('tenant-a/2026/09/invoice.pdf', 'tenant-a');
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it('rejects an invoice belonging to another tenant before looking up its PDF', async () => {
    const result = await generateInvoicePdf('invoice', 'tenant-b');
    expect(result).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
