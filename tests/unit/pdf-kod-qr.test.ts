import { createHash } from 'node:crypto';

import PDFDocument from 'pdfkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  invoiceRow: null as Record<string, unknown> | null,
  xmlRow: null as Record<string, unknown> | null,
  filters: [] as Array<[string, string, unknown]>,
}));

// Loader PDF czyta fakturę i skrót XML przez klienta admina — atrapa zwraca
// wiersze wg tabeli i zapamiętuje filtry (firma, faktura, ścieżka).
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (mocks.filters.push([table, k, v]), q),
        maybeSingle: async () => ({ data: table === 'invoices' ? mocks.invoiceRow : mocks.xmlRow, error: null }),
      };
      return q;
    },
  }),
}));

import { loadInvoiceForPdf } from '@/lib/pdf/invoice-data';
import { renderInvoicePdf } from '@/lib/pdf/invoice-renderer';
import { hexToBase64Url, invoiceVerificationUrl, ksefEnvForQr, qrLabel } from '@/lib/ksef/qr-verification';
import type { Invoice } from '@/types/invoice';

/**
 * KOD I na wizualizacji faktury (PDF poza KSeF) — CIRFMF/ksef-docs, kody-qr.md:
 * {adres QR}/invoice/{NIP}/{DD-MM-RRRR}/{SHA-256 pliku, Base64URL}, pod kodem
 * numer KSeF albo „OFFLINE”. Do 29.09 PDF kodował sam numer KSeF.
 */

// Przykład ze specyfikacji MF.
const HASH_B64URL = 'UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE';
const HASH_HEX = Buffer.from(HASH_B64URL, 'base64url').toString('hex');
const WZOR = 'https://qr-test.ksef.mf.gov.pl/invoice/1111111111/01-02-2026/UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE';

describe('KOD I — link weryfikacyjny', () => {
  it('odtwarza co do znaku przykład ze specyfikacji MF', () => {
    expect(invoiceVerificationUrl({ env: 'test', sellerNip: '1111111111', issueDate: '2026-02-01', sha256Hex: HASH_HEX })).toBe(WZOR);
  });

  it('adres środowiska: produkcja, demo, test (domyślnie)', () => {
    const url = (env: 'test' | 'demo' | 'production') =>
      invoiceVerificationUrl({ env, sellerNip: '1111111111', issueDate: '2026-02-01', sha256Hex: HASH_HEX });
    expect(url('production')).toBe(WZOR.replace('qr-test.', 'qr.'));
    expect(url('demo')).toBe(WZOR.replace('qr-test.', 'qr-demo.'));
    expect(ksefEnvForQr('production')).toBe('production');
    expect(ksefEnvForQr('demo')).toBe('demo');
    expect(ksefEnvForQr(undefined)).toBe('test');
    expect(ksefEnvForQr('prod')).toBe('test');
  });

  it('skrót: ten sam, który KSeF liczy z pliku (SHA-256 bajtów UTF-8)', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><Faktura>ąę</Faktura>';
    const hex = createHash('sha256').update(xml, 'utf8').digest('hex');
    const ksef = createHash('sha256').update(Buffer.from(xml, 'utf8')).digest('base64'); // jak encryption.ts
    expect(hexToBase64Url(hex)).toBe(ksef.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  });

  it.each([
    ['NIP krótszy', { sellerNip: '111111111' }],
    ['NIP pusty', { sellerNip: null }],
    ['brak skrótu (szkic bez pliku XML)', { sha256Hex: null }],
    ['skrót nie-SHA-256', { sha256Hex: 'abc' }],
    ['data nie ISO', { issueDate: '01.02.2026' }],
  ])('%s → bez kodu (null), nie kod prowadzący donikąd', (_opis, zmiana) => {
    expect(
      invoiceVerificationUrl({ env: 'test', sellerNip: '1111111111', issueDate: '2026-02-01', sha256Hex: HASH_HEX, ...zmiana }),
    ).toBeNull();
  });

  it('NIP z kreskami — normalizowany', () => {
    expect(invoiceVerificationUrl({ env: 'test', sellerNip: '111-111-11-11', issueDate: '2026-02-01', sha256Hex: HASH_HEX })).toBe(WZOR);
  });

  it('napis pod kodem: numer KSeF albo OFFLINE', () => {
    expect(qrLabel('1111111111-20260201-ABC123-01')).toBe('1111111111-20260201-ABC123-01');
    expect(qrLabel(null)).toBe('OFFLINE');
    expect(qrLabel('  ')).toBe('OFFLINE');
  });
});

describe('loader PDF — skrót pliku XML', () => {
  beforeEach(() => {
    mocks.filters = [];
    mocks.invoiceRow = {
      id: 'inv-1', tenant_id: 'ten-1', internal_number: 'FV/1', invoice_type: 'VAT', issue_date: '2026-02-01',
      sale_date: null, ksef_number: null, seller_nip: '1111111111', xml_storage_path: 'ten-1/2026/02/inv-1.xml',
      net_total: 100, vat_total: 23, gross_total: 123, notes: null, annotations: null, updated_at: null,
      pdf_storage_path: null, pdf_generated_at: null, seller_data: { nip: '1111111111' }, buyer_data: {}, payment_data: {},
      invoice_line_items: [],
    };
    mocks.xmlRow = { sha256_hash: HASH_HEX };
  });

  it('skrót z xml_documents po ścieżce, firmie i fakturze', async () => {
    const dane = await loadInvoiceForPdf('inv-1', 'ten-1');
    expect(dane).toMatchObject({ sellerNip: '1111111111', xmlSha256Hex: HASH_HEX });
    expect(mocks.filters.filter(([t]) => t === 'xml_documents')).toEqual([
      ['xml_documents', 'storage_path', 'ten-1/2026/02/inv-1.xml'],
      ['xml_documents', 'tenant_id', 'ten-1'],
      ['xml_documents', 'invoice_id', 'inv-1'],
    ]);
  });

  it('ścieżka spoza firmy (zapisywalne pole) — bez skrótu i bez zapytania', async () => {
    mocks.invoiceRow = { ...mocks.invoiceRow!, xml_storage_path: 'ten-2/2026/02/cudza.xml' };
    const dane = await loadInvoiceForPdf('inv-1', 'ten-1');
    expect(dane?.xmlSha256Hex).toBeNull();
    expect(mocks.filters.some(([t]) => t === 'xml_documents')).toBe(false);
  });

  it('szkic bez pliku XML — bez skrótu', async () => {
    mocks.invoiceRow = { ...mocks.invoiceRow!, xml_storage_path: null };
    expect((await loadInvoiceForPdf('inv-1', 'ten-1'))?.xmlSha256Hex).toBeNull();
  });
});

describe('renderer — napis pod kodem', () => {
  const faktura = {
    internalNumber: 'FV/1', type: 'VAT', issueDate: '2026-02-01',
    seller: { nip: '1111111111', name: 'S', address: { countryCode: 'PL', addressLine1: 'a', addressLine2: 'b' } },
    buyer: { nip: '5252241585', name: 'N', address: { countryCode: 'PL', addressLine1: 'a', addressLine2: 'b' } },
    lines: [], netTotal: 0, vatTotal: 0, grossTotal: 0,
    payment: { amountDue: 0, currency: 'PLN', dueDate: '2026-02-15', method: 'transfer' },
  } as unknown as Invoice;

  it('z kodem: napis OFFLINE albo numer KSeF pod kodem', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await renderInvoicePdf(faktura, { qrPayload: WZOR, qrLabel: 'OFFLINE' });
    expect(text.mock.calls.map((c) => String(c[0]))).toContain('OFFLINE');
    text.mockRestore();
  });

  it('bez kodu — bez napisu', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await renderInvoicePdf(faktura, { qrPayload: null, qrLabel: 'OFFLINE' });
    expect(text.mock.calls.map((c) => String(c[0]))).not.toContain('OFFLINE');
    text.mockRestore();
  });
});
