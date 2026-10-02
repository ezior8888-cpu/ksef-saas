import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #122 część B: faktura otrzymana ze skrzynki KSeF dostaje oryginał XML
 * (skrót do KODU I, „Pobierz XML”). Błąd nie blokuje kosztu — PDF zostaje
 * podglądem (B14).
 */

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  fetchBytes: vi.fn(),
  archive: vi.fn(),
  record: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/ksef/history-fetcher', () => ({ fetchInvoiceXmlBytes: mocks.fetchBytes }));
vi.mock('@/lib/import/ksef-xml-archive', () => ({ archiveImportedKsefXml: mocks.archive }));
vi.mock('@/lib/storage/xml-documents', () => ({ recordXmlDocument: mocks.record }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.capture }));

import { archiveInboxInvoiceXml } from '@/lib/ksef/inbox-xml';

const TENANT = 'tenant-a';
const INVOICE = 'invoice-a';
const KSEF = '1234567890-20261002-ABCDEF123456-01';
const archive = { storagePath: `${TENANT}/ksef-import/${KSEF}.xml`, sha256Hash: 'a'.repeat(64), sizeBytes: 10 };

type Row = Record<string, unknown>;
let row: Row | null;
let ops: string[];
let updateResult: { data: Row | null; error: { message: string } | null };

function client() {
  return {
    from(table: string) {
      let op = 'select';
      const filters: Array<[string, unknown]> = [];
      const q = {
        select: () => q,
        update: (patch: Row) => { op = `update:${JSON.stringify(patch)}`; return q; },
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        is: (k: string, v: unknown) => { filters.push([`${k} IS`, v]); return q; },
        maybeSingle: async () => {
          ops.push(`${table}:${op}:${JSON.stringify(filters)}`);
          return op === 'select' ? { data: row, error: null } : updateResult;
        },
      };
      return q;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  row = {
    id: INVOICE, tenant_id: TENANT, direction: 'incoming', ksef_number: KSEF,
    ksef_environment: 'test', xml_storage_path: null,
  };
  updateResult = { data: { id: INVOICE }, error: null };
  mocks.admin.mockReturnValue(client());
  mocks.fetchBytes.mockResolvedValue(Buffer.from('<Faktura/>'));
  mocks.archive.mockResolvedValue(archive);
  mocks.record.mockImplementation(async () => { ops.push('record'); });
});

const run = () => archiveInboxInvoiceXml({ tenantId: TENANT, invoiceId: INVOICE, environment: 'test' });

describe('skrzynka KSeF: oryginał XML faktury otrzymanej', () => {
  it('pobiera bajty, zapisuje xml_documents, potem ścieżkę (tylko gdy pusta)', async () => {
    await expect(run()).resolves.toEqual({ archived: true });
    expect(mocks.fetchBytes).toHaveBeenCalledWith(TENANT, KSEF, 'test');
    expect(mocks.record).toHaveBeenCalledWith({ tenantId: TENANT, invoiceId: INVOICE, ...archive });
    const update = ops.find((o) => o.includes('update'));
    expect(update).toContain(archive.storagePath);
    expect(update).toContain('xml_storage_path IS');
    // Najpierw wiersz ze skrótem, potem ścieżka: inaczej awaria w połowie
    // zostawiłaby fakturę ze ścieżką bez skrótu, a kolejny przebieg ją pominie.
    expect(ops.indexOf('record')).toBeLessThan(ops.findIndex((o) => o.includes('update')));
  });

  it.each([
    ['faktura wychodząca', { direction: 'outgoing' }],
    ['inne środowisko KSeF', { ksef_environment: 'production' }],
    ['bez numeru KSeF', { ksef_number: null }],
    ['już ma XML', { xml_storage_path: `${TENANT}/2026/10/x.xml` }],
  ])('%s — bez pobierania z KSeF', async (_label, patch) => {
    row = { ...row, ...patch };
    await expect(run()).resolves.toMatchObject({ archived: false });
    expect(mocks.fetchBytes).not.toHaveBeenCalled();
  });

  it('obca faktura (inna firma) — bez pobierania', async () => {
    row = null;
    await expect(run()).resolves.toMatchObject({ archived: false });
    expect(mocks.fetchBytes).not.toHaveBeenCalled();
  });

  it('błąd KSeF nie przerywa kosztu — wynik false i zgłoszenie do Sentry', async () => {
    mocks.fetchBytes.mockRejectedValueOnce(new Error('KSeF 503'));
    await expect(run()).resolves.toEqual({ archived: false, reason: 'error' });
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('błąd zapisu xml_documents — ścieżka przy fakturze nie jest ustawiana', async () => {
    mocks.record.mockRejectedValueOnce(new Error('db'));
    await expect(run()).resolves.toEqual({ archived: false, reason: 'error' });
    expect(ops.some((o) => o.includes('update'))).toBe(false);
  });
});
