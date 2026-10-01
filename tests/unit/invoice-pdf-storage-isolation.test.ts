import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), render: vi.fn(),
  exists: vi.fn(), download: vi.fn(), upload: vi.fn(),
  offlineQueueEntry: vi.fn(),
}));
vi.mock('@/lib/pdf/invoice-data', () => ({
  loadInvoiceForPdf: mocks.load, saveInvoicePdfPath: mocks.save,
  invoiceHasOfflineQueueEntry: mocks.offlineQueueEntry,
}));
vi.mock('@/lib/pdf/invoice-renderer', () => ({ renderInvoicePdf: mocks.render }));
vi.mock('@/lib/pdf/pdf-storage', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/pdf/pdf-storage')>(),
  invoicePdfExists: mocks.exists, downloadInvoicePdf: mocks.download, uploadInvoicePdf: mocks.upload,
}));
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf';
import { buildInvoicePdfKey } from '@/lib/pdf/pdf-storage';

const DRAFT_KEY = buildInvoicePdfKey('tenant-a', 'invoice', '2026-09-09');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exists.mockResolvedValue(true);
  mocks.download.mockResolvedValue(Buffer.from('cached-private-document'));
  mocks.render.mockResolvedValue(Buffer.from('generated-own-document'));
  mocks.offlineQueueEntry.mockResolvedValue(false);
  mocks.load.mockResolvedValue({
    invoice: { internalNumber: 'FV/1' }, tenantId: 'tenant-a', issueDate: '2026-09-09',
    pdfStoragePath: DRAFT_KEY,
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
    expect(mocks.upload).toHaveBeenCalledWith(DRAFT_KEY, Buffer.from('generated-own-document'));
  });

  it('preserves a valid tenant cache hit with an explicit tenant argument', async () => {
    const result = await generateInvoicePdf('invoice', 'tenant-a');
    expect(result).toMatchObject({ success: true, pdf: Buffer.from('cached-private-document') });
    expect(mocks.download).toHaveBeenCalledWith(DRAFT_KEY, 'tenant-a');
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
    expect(mocks.upload).toHaveBeenCalledWith(DRAFT_KEY, Buffer.from('generated-own-document'));
  });

  it('ignores an unrelated PDF path from the same tenant', async () => {
    mocks.load.mockResolvedValue({
      invoice: { internalNumber: 'FV/1' }, tenantId: 'tenant-a', issueDate: '2026-09-09',
      pdfStoragePath: buildInvoicePdfKey('tenant-a', 'other-invoice', '2026-09-09'),
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
    ksefStatus: 'draft', offlineIdempotencyKey: null,
  };
  beforeEach(() => vi.stubEnv('KSEF_ENV', 'test'));
  afterEach(() => vi.unstubAllEnvs());

  it('zaakceptowana: link weryfikacyjny w kodzie, numer KSeF pod kodem', async () => {
    mocks.load.mockResolvedValue({ ...bazowe, ksefStatus: 'accepted', ksefNumber: '1111111111-20260201-ABC-01', xmlSha256Hex: HEX });
    await generateInvoicePdf('invoice', 'tenant-a');
    expect(mocks.render.mock.calls[0]![1]).toMatchObject({
      qrPayload: 'https://qr-test.ksef.mf.gov.pl/invoice/1111111111/01-02-2026/UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE',
      qrLabel: '1111111111-20260201-ABC-01',
    });
  });

  it('po uzupełnieniu hasha XML regeneruje zaakceptowany PDF bez KODU I z cache', async () => {
    const ksefNumber = '1234567890-20260201-ABC-01';
    mocks.load.mockResolvedValue({
      ...bazowe, ksefStatus: 'accepted', ksefNumber, xmlSha256Hex: HEX,
      // Cache powstał, kiedy hash XML nie był jeszcze dostępny.
      pdfStoragePath: buildInvoicePdfKey('tenant-a', 'invoice', '2026-02-01', null, ksefNumber),
      pdfGeneratedAt: '2026-02-02T13:00:00Z', updatedAt: '2026-02-01T12:00:00Z',
    });

    expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({ success: true });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.render.mock.calls[0]![1]).toMatchObject({
      qrPayload: expect.stringContaining('/invoice/1111111111/01-02-2026/'),
      qrLabel: ksefNumber,
    });
    expect(mocks.upload.mock.calls[0]![0]).not.toBe(buildInvoicePdfKey('tenant-a', 'invoice', '2026-02-01', null, ksefNumber));
  });

  it('blokuje PDF, gdy faktura wejdzie do Offline24 podczas renderowania', async () => {
    const draft = { ...bazowe, ksefNumber: null, xmlSha256Hex: null };
    mocks.load.mockResolvedValue(draft);
    mocks.render.mockImplementation(async () => {
      mocks.load.mockResolvedValue({ ...draft, ksefStatus: 'draft', offlineIdempotencyKey: 'offline-key' });
      return Buffer.from('stale-draft-pdf');
    });

    expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({
      success: false, code: 'OFFLINE_QR_UNAVAILABLE',
    });
    expect(mocks.render).toHaveBeenCalledOnce();
  });

  it('blokuje PDF, gdy osierocony wpis kolejki pojawi się podczas odczytu cache', async () => {
    mocks.load.mockResolvedValue({
      ...bazowe, ksefNumber: null, xmlSha256Hex: null,
      pdfStoragePath: buildInvoicePdfKey('tenant-a', 'invoice', '2026-02-01'),
      pdfGeneratedAt: '2026-02-02T13:00:00Z', updatedAt: '2026-02-01T12:00:00Z',
    });
    mocks.download.mockImplementation(async () => {
      mocks.offlineQueueEntry.mockResolvedValue(true);
      return Buffer.from('stale-cached-pdf');
    });

    expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({
      success: false, code: 'OFFLINE_QR_UNAVAILABLE',
    });
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.offlineQueueEntry).toHaveBeenCalledTimes(2);
  });

  it('widzi częściowy zapis znacznika między końcowym odczytem kolejki i faktury', async () => {
    const draft = { ...bazowe, ksefNumber: null, xmlSha256Hex: null };
    mocks.load.mockResolvedValue(draft);
    let queueReads = 0;
    mocks.offlineQueueEntry.mockImplementation(async () => {
      queueReads += 1;
      if (queueReads === 2) {
        mocks.load.mockResolvedValue({ ...draft, offlineIdempotencyKey: 'offline-key' });
      }
      return false;
    });

    expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({
      success: false, code: 'OFFLINE_QR_UNAVAILABLE',
    });
    expect(queueReads).toBe(2);
  });

  it('nie wydaje starego PDF, gdy numer KSeF przyjdzie podczas renderowania', async () => {
    const draft = { ...bazowe, ksefNumber: null, xmlSha256Hex: null };
    mocks.load.mockResolvedValue(draft);
    mocks.render.mockImplementation(async () => {
      mocks.load.mockResolvedValue({
        ...draft, ksefStatus: 'accepted', ksefNumber: '1234567890-20260201-ABC-01', xmlSha256Hex: HEX,
      });
      return Buffer.from('stale-draft-pdf');
    });

    expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({
      success: false, code: 'PDF_STATE_CHANGED',
    });
    expect(mocks.render).toHaveBeenCalledOnce();
  });

  it.each([
    ['świeży PDF', null],
    ['PDF z cache', 'tenant-a/2026/02/invoice.v4.pdf'],
  ])('offline_queued bez numeru: blokuje %s przed wydaniem jednostkowym i w paczce', async (_label, pdfStoragePath) => {
    mocks.load.mockResolvedValue({
      ...bazowe,
      ksefStatus: 'offline_queued', ksefNumber: null, xmlSha256Hex: HEX,
      pdfStoragePath, pdfGeneratedAt: '2026-02-02T13:00:00Z', updatedAt: '2026-02-01T12:00:00Z',
    });

    expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({
      success: false, code: 'OFFLINE_QR_UNAVAILABLE',
    });
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('po nadaniu numeru KSeF dopuszcza pojedynczy KOD I', async () => {
    mocks.load.mockResolvedValue({
      ...bazowe, ksefStatus: 'accepted', offlineIdempotencyKey: 'offline-key',
      ksefNumber: '1234567890-20260201-ABC-01', xmlSha256Hex: HEX,
    });
    expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({ success: true });
    expect(mocks.render.mock.calls[0]![1]).toMatchObject({
      qrLabel: '1234567890-20260201-ABC-01',
      qrPayload: expect.stringContaining('/invoice/1111111111/01-02-2026/'),
    });
    expect(mocks.offlineQueueEntry).toHaveBeenCalledOnce();
  });

  it('faktura z numerem KSeF bez skrótu XML nie wydaje PDF także z cache', async () => {
    mocks.load.mockResolvedValue({
      ...bazowe, ksefStatus: 'accepted', ksefNumber: '1234567890-20260201-ABC-01',
      xmlSha256Hex: null, pdfStoragePath: 'tenant-a/2026/02/invoice.v4.pdf',
      pdfGeneratedAt: '2026-02-02T13:00:00Z', updatedAt: '2026-02-01T12:00:00Z',
    });

    expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({
      success: false, code: 'KSEF_QR_UNAVAILABLE',
    });
    expect(mocks.offlineQueueEntry).not.toHaveBeenCalled();
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('osierocony wpis kolejki bez znacznika blokuje nawet świeży PDF z cache', async () => {
    mocks.load.mockResolvedValue({
      ...bazowe, ksefNumber: null, offlineIdempotencyKey: null,
      pdfStoragePath: 'tenant-a/2026/02/invoice.v4.pdf',
      pdfGeneratedAt: '2026-02-02T13:00:00Z', updatedAt: '2026-02-01T12:00:00Z',
    });
    mocks.offlineQueueEntry.mockResolvedValue(true);

    expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({
      success: false, code: 'OFFLINE_QR_UNAVAILABLE',
    });
    expect(mocks.offlineQueueEntry).toHaveBeenCalledWith('invoice', 'tenant-a');
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it('błąd odczytu kolejki nie wydaje PDF ani z cache, ani z renderera', async () => {
    mocks.load.mockResolvedValue({
      ...bazowe, ksefNumber: null,
      pdfStoragePath: 'tenant-a/2026/02/invoice.v4.pdf',
      pdfGeneratedAt: '2026-02-02T13:00:00Z', updatedAt: '2026-02-01T12:00:00Z',
    });
    mocks.offlineQueueEntry.mockRejectedValue(new Error('queue unavailable'));

    await expect(generateInvoicePdf('invoice', 'tenant-a')).rejects.toThrow('queue unavailable');
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it.each(['failed', 'rejected'])(
    'po przejściu offline_queued → %s nadal blokuje PDF także z cache',
    async (ksefStatus) => {
      const persistedOffline = {
        ...bazowe, offlineIdempotencyKey: 'offline-key', ksefNumber: null,
        xmlSha256Hex: HEX, pdfStoragePath: 'tenant-a/2026/02/invoice.v4.pdf',
        pdfGeneratedAt: '2026-02-02T13:00:00Z', updatedAt: '2026-02-01T12:00:00Z',
      };
      mocks.load.mockResolvedValueOnce({ ...persistedOffline, ksefStatus: 'offline_queued' });
      mocks.load.mockResolvedValueOnce({ ...persistedOffline, ksefStatus });

      expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({
        success: false, code: 'OFFLINE_QR_UNAVAILABLE',
      });
      expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({
        success: false, code: 'OFFLINE_QR_UNAVAILABLE',
      });
      expect(mocks.exists).not.toHaveBeenCalled();
      expect(mocks.download).not.toHaveBeenCalled();
      expect(mocks.render).not.toHaveBeenCalled();
      expect(mocks.upload).not.toHaveBeenCalled();
    },
  );

  it('wysłana, bez numeru: ten sam link, napis OFFLINE', async () => {
    mocks.load.mockResolvedValue({ ...bazowe, ksefNumber: null, xmlSha256Hex: HEX });
    await generateInvoicePdf('invoice', 'tenant-a');
    expect(mocks.render.mock.calls[0]![1]).toMatchObject({ qrLabel: 'OFFLINE' });
    expect(String(mocks.render.mock.calls[0]![1].qrPayload)).toContain('/invoice/1111111111/01-02-2026/');
  });

  it('szkic bez pliku XML: bez kodu', async () => {
    mocks.load.mockResolvedValue({ ...bazowe, ksefNumber: null, xmlSha256Hex: null });
    expect(await generateInvoicePdf('invoice', 'tenant-a')).toMatchObject({ success: true });
    expect(mocks.render.mock.calls[0]![1]).toMatchObject({ qrPayload: null });
    expect(mocks.offlineQueueEntry).toHaveBeenCalledWith('invoice', 'tenant-a');
  });
});

// Korekta: dane faktury korygowanej (art. 106j ust. 2) z loadera do renderera.
describe('PDF korekty: faktura korygowana', () => {
  it('loader → renderer bez zmian', async () => {
    const correctedInvoice = { number: 'FV/9/09', issueDate: '2026-09-05', ksefNumber: null, reason: 'Błędna cena' };
    mocks.load.mockResolvedValue({
      invoice: { internalNumber: 'KOR/1' }, tenantId: 'tenant-a', issueDate: '2026-10-01',
      pdfStoragePath: null, pdfGeneratedAt: null, updatedAt: null, correctedInvoice,
    });
    await generateInvoicePdf('invoice', 'tenant-a');
    expect(mocks.render.mock.calls[0]![1]).toMatchObject({ correctedInvoice });
  });
});
