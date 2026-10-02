import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), pdf: vi.fn(), zip: vi.fn(), capture: vi.fn(),
}));

vi.mock('@/lib/supabase/auth-context', () => ({ resolveApiUserAndActiveOrg: mocks.auth }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/pdf/invoice-pdf', () => ({ generateInvoicePdf: mocks.pdf }));
vi.mock('@/lib/exports/zip-packager', () => ({ packageZip: mocks.zip }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.capture }));

import { GET as getSinglePdf } from '@/app/api/invoices/[id]/pdf/route';
import { GET as getBatchPdf } from '@/app/api/invoices/batch-pdf/route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, tenantId: 'tenant-a' });
  mocks.admin.mockReturnValue({
    from: () => {
      const query = {
        select: () => query, eq: () => query, gte: () => query, lte: () => query,
        limit: async () => ({ data: [
          { id: 'accepted', internal_number: 'FV/1' },
          { id: 'offline', internal_number: 'FV/2' },
        ], error: null }),
      };
      return query;
    },
  });
  mocks.pdf.mockImplementation(async (id: string) => id === 'offline'
    ? { success: false, code: 'OFFLINE_QR_UNAVAILABLE', error: 'Brak KODU II' }
    : { success: true, pdf: Buffer.from('pdf'), filename: 'FV1.pdf' });
});

describe('PDF faktury offline bez KODU II', () => {
  it('pojedyncze pobranie i podgląd zwraca 409', async () => {
    const response = await getSinglePdf(
      new Request('https://example.test/api/invoices/offline/pdf'),
      { params: Promise.resolve({ id: 'offline' }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Brak KODU II' });
  });

  it('cała paczka zwraca 409 zamiast niepełnego ZIP', async () => {
    const response = await getBatchPdf(new Request('https://example.test/api/invoices/batch-pdf?from=2026-02-01&to=2026-02-28'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'offline_qr_unavailable' });
    expect(mocks.pdf).toHaveBeenCalledTimes(2);
    expect(mocks.zip).not.toHaveBeenCalled();
  });
});

describe('PDF faktury z numerem KSeF bez KODU I (podgląd, B14)', () => {
  beforeEach(() => {
    mocks.pdf.mockImplementation(async (id: string) => ({
      success: true, pdf: Buffer.from('pdf'), filename: `${id}.pdf`, qrStateKey: 'k', missingKodI: id === 'accepted',
    }));
    mocks.zip.mockResolvedValue(Buffer.from('zip'));
  });

  it('paczka ZIP do pobrania dla siebie zawiera podgląd', async () => {
    const response = await getBatchPdf(new Request('https://example.test/api/invoices/batch-pdf?from=2026-02-01&to=2026-02-28'));
    expect(response.status).toBe(200);
    expect(mocks.zip).toHaveBeenCalled();
  });
});

describe('Zmiana stanu faktury podczas przygotowania PDF', () => {
  beforeEach(() => {
    mocks.pdf.mockResolvedValue({ success: false, code: 'PDF_STATE_CHANGED', error: 'Stan faktury zmienił się' });
  });

  it('pojedyncze pobranie zwraca 409', async () => {
    const response = await getSinglePdf(
      new Request('https://example.test/api/invoices/accepted/pdf'),
      { params: Promise.resolve({ id: 'accepted' }) },
    );
    expect(response.status).toBe(409);
  });

  it('paczka nie pomija faktury, której stan zmienił się w trakcie renderowania', async () => {
    const response = await getBatchPdf(new Request('https://example.test/api/invoices/batch-pdf?from=2026-02-01&to=2026-02-28'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'pdf_state_changed' });
    expect(mocks.zip).not.toHaveBeenCalled();
  });
});
