import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), render: vi.fn(),
  exists: vi.fn(), download: vi.fn(), upload: vi.fn(),
}));
vi.mock('@/lib/pdf/invoice-data', () => ({
  loadInvoiceForPdf: mocks.load, saveInvoicePdfPath: mocks.save,
}));
vi.mock('@/lib/pdf/invoice-renderer', () => ({ renderInvoicePdf: mocks.render }));
vi.mock('@/lib/pdf/pdf-storage', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/pdf/pdf-storage')>(),
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
    pdfStoragePath: 'tenant-a/2026/09/invoice.v4.pdf',
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
    expect(mocks.upload).toHaveBeenCalledWith('tenant-a/2026/09/invoice.v4.pdf', Buffer.from('generated-own-document'));
  });

  it('preserves a valid tenant cache hit with an explicit tenant argument', async () => {
    const result = await generateInvoicePdf('invoice', 'tenant-a');
    expect(result).toMatchObject({ success: true, pdf: Buffer.from('cached-private-document') });
    expect(mocks.download).toHaveBeenCalledWith('tenant-a/2026/09/invoice.v4.pdf', 'tenant-a');
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it('regenerates an old PDF cache after the renderer adds the VAT exemption basis', async () => {
    mocks.load.mockResolvedValue({
      invoice: { internalNumber: 'FV/1', annotations: { vatExemptionBasis: 'fixture basis' } },
      tenantId: 'tenant-a', issueDate: '2026-09-09',
      pdfStoragePath: 'tenant-a/2026/09/invoice.pdf',
      pdfGeneratedAt: '2026-09-09T13:00:00Z', updatedAt: '2026-09-09T12:00:00Z',
    });

    const result = await generateInvoicePdf('invoice', 'tenant-a');
    expect(result).toMatchObject({ success: true, pdf: Buffer.from('generated-own-document') });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledWith('tenant-a/2026/09/invoice.v4.pdf', Buffer.from('generated-own-document'));
  });

  it('ignores an unrelated PDF path from the same tenant', async () => {
    mocks.load.mockResolvedValue({
      invoice: { internalNumber: 'FV/1' }, tenantId: 'tenant-a', issueDate: '2026-09-09',
      pdfStoragePath: 'tenant-a/2026/09/other-invoice.v4.pdf',
      pdfGeneratedAt: '2026-09-09T13:00:00Z', updatedAt: '2026-09-09T12:00:00Z',
    });

    await generateInvoicePdf('invoice', 'tenant-a');
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledOnce();
  });

  it('rejects an invoice belonging to another tenant before looking up its PDF', async () => {
    const result = await generateInvoicePdf('invoice', 'tenant-b');
    expect(result).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
});

// KOD I (specyfikacja MF, kody-qr.md): link z NIP-u, daty i SHA-256 pliku XML,
// pod nim numer KSeF albo OFFLINE — nie sam numer KSeF w kodzie.
describe('PDF: kod QR weryfikacji w KSeF', () => {
  const HEX = Buffer.from('UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE', 'base64url').toString('hex');
  const bazowe = {
    invoice: { internalNumber: 'FV/1' }, tenantId: 'tenant-a', issueDate: '2026-02-01',
    pdfStoragePath: null, pdfGeneratedAt: null, updatedAt: null, sellerNip: '1111111111',
  };
  beforeEach(() => vi.stubEnv('KSEF_ENV', 'test'));
  afterEach(() => vi.unstubAllEnvs());

  it('zaakceptowana: link weryfikacyjny w kodzie, numer KSeF pod kodem', async () => {
    mocks.load.mockResolvedValue({ ...bazowe, ksefNumber: '1111111111-20260201-ABC-01', xmlSha256Hex: HEX });
    await generateInvoicePdf('invoice', 'tenant-a');
    expect(mocks.render.mock.calls[0]![1]).toMatchObject({
      qrPayload: 'https://qr-test.ksef.mf.gov.pl/invoice/1111111111/01-02-2026/UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE',
      qrLabel: '1111111111-20260201-ABC-01',
    });
  });

  it('wysłana, bez numeru: ten sam link, napis OFFLINE', async () => {
    mocks.load.mockResolvedValue({ ...bazowe, ksefNumber: null, xmlSha256Hex: HEX });
    await generateInvoicePdf('invoice', 'tenant-a');
    expect(mocks.render.mock.calls[0]![1]).toMatchObject({ qrLabel: 'OFFLINE' });
    expect(String(mocks.render.mock.calls[0]![1].qrPayload)).toContain('/invoice/1111111111/01-02-2026/');
  });

  it('szkic bez pliku XML: bez kodu', async () => {
    mocks.load.mockResolvedValue({ ...bazowe, ksefNumber: null, xmlSha256Hex: null });
    await generateInvoicePdf('invoice', 'tenant-a');
    expect(mocks.render.mock.calls[0]![1]).toMatchObject({ qrPayload: null });
  });
});
