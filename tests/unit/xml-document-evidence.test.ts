import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  download: vi.fn(),
  invoiceRead: vi.fn(),
  metadataRead: vi.fn(),
  metadataInsert: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/storage/r2', () => ({ downloadFromR2: mocks.download }));

import { recordXmlDocument } from '@/lib/storage/xml-documents';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INVOICE = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PATH = `${TENANT}/2026/10/${INVOICE}.xml`;
// Includes an UTF-16 BOM and bytes that cannot roundtrip through UTF-8.
const XML = Buffer.from([0xff, 0xfe, 0x3c, 0x00, 0x46, 0x00, 0x2f, 0x00, 0x3e, 0x00]);
const HASH = createHash('sha256').update(XML).digest('hex');
const RECORD = { tenantId: TENANT, invoiceId: INVOICE, storagePath: PATH };
const EVIDENCE = {
  storage_provider: 'r2', storage_path: PATH, sha256_hash: HASH, file_size_bytes: XML.length,
};

type Evidence = {
  storage_provider: string | null;
  storage_path: string;
  sha256_hash: string;
  file_size_bytes: number | null;
};
type Insert = Evidence & { invoice_id: string; tenant_id: string };
type Query = { table: string; filters: Array<[string, unknown]>; limit?: number };
let rows: Evidence[];
let queries: Query[];

function database() {
  return {
    from(table: string) {
      const entry: Query = { table, filters: [] };
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => { entry.filters.push([key, value]); return q; },
        maybeSingle: async () => { queries.push(entry); return mocks.invoiceRead(); },
        limit: async (n: number) => { entry.limit = n; queries.push(entry); return mocks.metadataRead(); },
        insert: async (row: Insert) => mocks.metadataInsert(row),
      };
      return q;
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  rows = [];
  queries = [];
  mocks.admin.mockReturnValue(database());
  mocks.invoiceRead.mockResolvedValue({ data: { id: INVOICE, tenant_id: TENANT }, error: null });
  mocks.download.mockResolvedValue(XML);
  mocks.metadataRead.mockImplementation(async () => ({ data: [...rows], error: null }));
  mocks.metadataInsert.mockImplementation(async (row: Insert) => {
    if (rows.length) return { error: { code: '23505', message: 'duplicate' } };
    rows.push(row);
    return { error: null };
  });
});

describe('xml_documents: trwały dowód dokładnych bajtów XML', () => {
  it('liczy hash i rozmiar z oryginalnych bajtów także bez danych uploadu', async () => {
    await recordXmlDocument(RECORD);
    expect(mocks.download).toHaveBeenCalledWith(PATH, TENANT);
    expect(mocks.metadataInsert).toHaveBeenCalledWith({
      ...EVIDENCE, invoice_id: INVOICE, tenant_id: TENANT,
    });
    expect(queries).toEqual([
      { table: 'invoices', filters: [['id', INVOICE], ['tenant_id', TENANT]] },
      { table: 'xml_documents', filters: [['invoice_id', INVOICE], ['tenant_id', TENANT]], limit: 2 },
    ]);
  });

  it('weryfikuje magazyn również gdy caller przekazał hash i rozmiar', async () => {
    await recordXmlDocument({ ...RECORD, sha256Hash: HASH, sizeBytes: XML.length });
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['hash', { sha256Hash: 'a'.repeat(64) }],
    ['rozmiar', { sizeBytes: XML.length + 1 }],
    ['pusty hash', { sha256Hash: '' }],
    ['zerowy rozmiar', { sizeBytes: 0 }],
  ])('nie zapisuje oczekiwanego dowodu gdy %s jest niezgodny z magazynem', async (_label, expected) => {
    await expect(recordXmlDocument({ ...RECORD, ...expected })).rejects.toThrow('oczekiwanym XML');
    expect(mocks.metadataRead).not.toHaveBeenCalled();
    expect(mocks.metadataInsert).not.toHaveBeenCalled();
  });

  it('ponowienie tego samego pliku jest no-op po weryfikacji bajtów', async () => {
    rows = [{ ...EVIDENCE }];
    await recordXmlDocument(RECORD);
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.metadataInsert).not.toHaveBeenCalled();
    expect(rows).toEqual([EVIDENCE]);
  });

  it.each([
    ['ścieżka', { storage_path: `${TENANT}/2026/09/${INVOICE}.xml` }],
    ['hash', { sha256_hash: 'a'.repeat(64) }],
    ['rozmiar', { file_size_bytes: XML.length + 1 }],
    ['brak rozmiaru', { file_size_bytes: null }],
    ['dostawca', { storage_provider: 's3_glacier' }],
    ['brak dostawcy', { storage_provider: null }],
  ])('odrzuca konflikt pola %s bez zastąpienia istniejących dowodów', async (_label, patch) => {
    const existing = { ...EVIDENCE, ...patch };
    rows = [existing];
    await expect(recordXmlDocument(RECORD)).rejects.toThrow('inny plik XML');
    expect(mocks.metadataInsert).not.toHaveBeenCalled();
    expect(rows).toEqual([existing]);
  });

  it('odrzuca historię z dwoma wierszami zamiast arbitralnego wyboru', async () => {
    rows = [{ ...EVIDENCE }, { ...EVIDENCE }];
    await expect(recordXmlDocument(RECORD)).rejects.toThrow('wiele zapisów XML');
    expect(mocks.metadataInsert).not.toHaveBeenCalled();
    expect(rows).toHaveLength(2);
  });

  it('równoległe identyczne zapisy: przegrany 23505 sprawdza zwycięski wiersz', async () => {
    let releaseReads: (() => void) | undefined;
    const bothRead = new Promise<void>((resolve) => { releaseReads = resolve; });
    let firstReads = 0;
    mocks.metadataRead.mockImplementation(async () => {
      if (++firstReads <= 2) {
        if (firstReads === 2) releaseReads?.();
        await bothRead;
        return { data: [], error: null };
      }
      return { data: [...rows], error: null };
    });
    await expect(Promise.all([recordXmlDocument(RECORD), recordXmlDocument(RECORD)])).resolves.toEqual([undefined, undefined]);
    expect(mocks.metadataInsert).toHaveBeenCalledTimes(2);
    expect(mocks.metadataRead).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['inny XML', [{ ...EVIDENCE, sha256_hash: 'a'.repeat(64) }], 'inny plik XML'],
    ['duplikaty', [{ ...EVIDENCE }, { ...EVIDENCE }], 'wiele zapisów XML'],
    ['brak wiersza', [], 'konflikt zapisu bez metadanych'],
  ])('23505 nie ukrywa konfliktu: %s', async (_label, concurrentRows, message) => {
    mocks.metadataInsert.mockImplementationOnce(async () => {
      rows = concurrentRows;
      return { error: { code: '23505', message: 'duplicate' } };
    });
    await expect(recordXmlDocument(RECORD)).rejects.toThrow(message);
    expect(mocks.metadataRead).toHaveBeenCalledTimes(2);
  });

  it('błąd ponownego odczytu po 23505 jest błędem zapisu dowodu', async () => {
    mocks.metadataInsert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate' } });
    mocks.metadataRead.mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'read unavailable' } });
    await expect(recordXmlDocument(RECORD)).rejects.toThrow('read unavailable');
  });

  it('błąd odczytu metadanych nie uruchamia INSERT', async () => {
    mocks.metadataRead.mockResolvedValueOnce({ data: null, error: { message: 'read unavailable' } });
    await expect(recordXmlDocument(RECORD)).rejects.toThrow('read unavailable');
    expect(mocks.metadataInsert).not.toHaveBeenCalled();
  });

  it('brak wyniku zapytania nie oznacza pustej historii', async () => {
    mocks.metadataRead.mockResolvedValueOnce({ data: null, error: null });
    await expect(recordXmlDocument(RECORD)).rejects.toThrow('brak wyniku odczytu');
    expect(mocks.metadataInsert).not.toHaveBeenCalled();
  });

  it('pozostałe błędy INSERT są propagowane bez uznania za ponowienie', async () => {
    mocks.metadataInsert.mockResolvedValueOnce({ error: { code: '42501', message: 'permission denied' } });
    await expect(recordXmlDocument(RECORD)).rejects.toThrow('permission denied');
    expect(mocks.metadataRead).toHaveBeenCalledOnce();
  });

  it('błąd magazynu zatrzymuje zapis metadanych', async () => {
    mocks.download.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(recordXmlDocument(RECORD)).rejects.toThrow('storage unavailable');
    expect(mocks.metadataRead).not.toHaveBeenCalled();
    expect(mocks.metadataInsert).not.toHaveBeenCalled();
  });

  it.each([
    `${OTHER_TENANT}/2026/10/${INVOICE}.xml`,
    `${TENANT}/../${OTHER_TENANT}/x.xml`,
  ])('obca lub niebezpieczna ścieżka nie uruchamia admina ani magazynu', async (storagePath) => {
    await expect(recordXmlDocument({ ...RECORD, storagePath })).rejects.toThrow('organization');
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each([
    ['nieznana faktura', null],
    ['obca firma', { id: INVOICE, tenant_id: OTHER_TENANT }],
    ['inna faktura', { id: '22222222-2222-4222-8222-222222222222', tenant_id: TENANT }],
  ])('%s nie może uzyskać dowodu przez service_role', async (_label, invoice) => {
    mocks.invoiceRead.mockResolvedValueOnce({ data: invoice, error: null });
    await expect(recordXmlDocument(RECORD)).rejects.toThrow('nie należy');
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.metadataInsert).not.toHaveBeenCalled();
  });

  it('awaria weryfikacji organizacji zatrzymuje odczyt pliku', async () => {
    mocks.invoiceRead.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });
    await expect(recordXmlDocument(RECORD)).rejects.toThrow('Nie można sprawdzić');
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
