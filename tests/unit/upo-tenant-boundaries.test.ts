import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;
type Query = { table: string; operation: 'select' | 'insert' | 'update'; filters: Array<[string, unknown]>; patch?: Row };
const mocks = vi.hoisted(() => ({ admin: vi.fn(), download: vi.fn(), xml: vi.fn(), pdf: vi.fn(), render: vi.fn(), audit: vi.fn(), sentry: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/ksef/upo-client', () => ({ downloadUpoFromKsef: mocks.download }));
vi.mock('@/lib/ksef/upo-storage', () => ({ uploadUpoXml: mocks.xml, uploadUpoPdf: mocks.pdf }));
vi.mock('@/lib/ksef/upo-pdf-generator', () => ({ generateUpoPdf: mocks.render }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.sentry, addBreadcrumb: vi.fn() }));
import { runDownloadUpo } from '@/lib/inngest/jobs/download-upo';
import { runUpoRetryStale } from '@/lib/inngest/jobs/upo-retry-stale';
import { UPO_IDENTITY_MISMATCH } from '@/lib/inngest/jobs/upo-identity';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const RECEIPT = '33333333-3333-4333-8333-333333333333';
const REF = 'TEST-UPO-REFERENCE';
const event = { invoiceId: ID, tenantId: A, ksefNumber: REF, nip: '1234567890' };
const invoice = (patch: Row = {}): Row => ({ id: ID, tenant_id: A, ksef_number: REF, ksef_status: 'accepted',
  internal_number: 'TEST-1', issue_date: '2026-01-01', gross_total: 123, buyer_data: { name: 'Test buyer' },
  buyer_nip: '1234567890', seller_nip: '1234567890', tenants: { id: A, name: 'Test seller', nip: '1234567890' }, ...patch });
const receipt = (patch: Row = {}): Row => ({ id: RECEIPT, tenant_id: A, invoice_id: ID, ksef_number: REF,
  status: 'pending', download_attempts: 0, last_error: null, created_at: '2000-01-01', ...patch });
let tables: Record<string, Row[]>;
let errors: Set<string>;
let calls: Query[];
let beforeQuery: ((query: Query) => void) | undefined;
const writes = () => calls.filter((q) => q.operation !== 'select');
function client() {
  return { from(table: string) {
    const q: Query = { table, operation: 'select', filters: [] };
    calls.push(q);
    const predicates: Array<(r: Row) => boolean> = [];
    let one = false;
    let max = Infinity;
    let joinInvoice = false;
    let ordered = false;
    const execute = () => {
      beforeQuery?.(q);
      if (errors.has(table)) return { data: null, error: { message: 'PRIVATE-DB-DIAGNOSTIC' } };
      let rows = (tables[table] ?? []).filter((r) => predicates.every((check) => check(r)));
      if (ordered) rows = rows.toSorted((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      rows = rows.slice(0, max);
      if (q.operation === 'insert') {
        // Real schema has UNIQUE(invoice_id), including foreign-tenant records.
        if ((tables[table] ?? []).some((r) => r.invoice_id === q.patch?.invoice_id)) {
          return { data: null, error: { message: 'PRIVATE-UNIQUE-ERROR' } };
        }
        const inserted = receipt({ ...q.patch });
        (tables[table] ??= []).push(inserted);
        rows = [inserted];
      }
      if (q.operation === 'update') rows.forEach((r) => Object.assign(r, q.patch));
      const result = rows.map((r) => ({ ...r, ...(joinInvoice ? {
        invoices: tables.invoices.find((inv) => inv.id === r.invoice_id) ?? null,
      } : {}) }));
      return { data: one ? result[0] ?? null : result, error: null };
    };
    const builder = {
      select: (cols = '') => { joinInvoice = cols.includes('invoices('); return builder; },
      eq: (key: string, value: unknown) => { q.filters.push([key, value]); predicates.push((r) => r[key] === value); return builder; },
      in: (key: string, value: unknown[]) => { q.filters.push([key, value]); predicates.push((r) => value.includes(r[key])); return builder; },
      lt: (key: string, value: string) => { predicates.push((r) => String(r[key]) < value); return builder; },
      or: (filter: string) => {
        expect(filter).toBe('last_error.is.null,last_error.neq.' + UPO_IDENTITY_MISMATCH);
        predicates.push((r) => r.last_error == null || r.last_error !== UPO_IDENTITY_MISMATCH); return builder;
      },
      order: () => { ordered = true; return builder; },
      limit: (n: number) => { max = n; return builder; },
      update: (patch: Row) => { q.operation = 'update'; q.patch = patch; return builder; },
      insert: (patch: Row) => { q.operation = 'insert'; q.patch = patch; return builder; },
      maybeSingle: () => { one = true; return Promise.resolve(execute()); },
      single: () => { one = true; return Promise.resolve(execute()); },
      then: <T = ReturnType<typeof execute>, E = never>(resolve?: ((v: ReturnType<typeof execute>) => T | PromiseLike<T>) | null,
        reject?: ((e: unknown) => E | PromiseLike<E>) | null) => Promise.resolve(execute()).then(resolve, reject),
    };
    return builder;
  } };
}
const sendEvent = vi.fn();
const context: JobContext = { attempt: 0, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_name, fn) => fn(), sleep: vi.fn(), sendEvent, scheduleAfter: vi.fn() } };
function cachedContext(cache: Record<string, unknown>): JobContext {
  return { ...context, step: { ...context.step, run: async <T>(name: string, fn: () => T | Promise<T>): Promise<T> =>
    name in cache ? cache[name] as T : fn() } };
}
function expectNoExternalEffects() {
  for (const mock of [mocks.download, mocks.xml, mocks.pdf, mocks.render, mocks.audit]) expect(mock).not.toHaveBeenCalled();
  expect(sendEvent).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.clearAllMocks(); calls = []; errors = new Set(); beforeQuery = undefined;
  tables = { invoices: [invoice()], upo_receipts: [] };
  mocks.admin.mockImplementation(client);
  mocks.download.mockResolvedValue({ success: true, upoXml: '<test/>', upoXmlHash: 'hash', upoId: 'test-upo', acceptanceTimestamp: '2026-01-01' });
  mocks.xml.mockResolvedValue('upo/' + A + '/' + ID + '.xml');
  mocks.render.mockResolvedValue(Buffer.from('test-pdf'));
  mocks.pdf.mockResolvedValue('upo/' + A + '/' + ID + '.pdf');
});

describe('UPO worker boundaries', () => {
  it('rejects malformed event identity before privileged reads', async () => {
    await expect(runDownloadUpo({ ...event, invoiceId: 'invalid' }, context)).rejects.toThrow('tożsamość');
    expect(mocks.admin).not.toHaveBeenCalled(); expectNoExternalEffects();
  });
  it.each([{ tenant_id: B }, { ksef_number: 'OTHER' }, { ksef_status: 'sending' }])('blocks inconsistent accepted invoice %j before writes', async (patch) => {
    tables.invoices = [invoice(patch)];
    await expect(runDownloadUpo(event, context)).rejects.toThrow('zaakceptowanej');
    expect(writes()).toEqual([]); expectNoExternalEffects();
  });
  it('does not trust a foreign downloaded receipt or overwrite it', async () => {
    tables.upo_receipts = [receipt({ tenant_id: B, status: 'downloaded' })];
    await expect(runDownloadUpo(event, context)).rejects.toThrow('utworzyć');
    expect(tables.upo_receipts[0].tenant_id).toBe(B);
    expect(tables.upo_receipts[0].status).toBe('downloaded'); expectNoExternalEffects();
  });
  it('rejects an own receipt with the wrong KSeF reference even if marked downloaded', async () => {
    tables.upo_receipts = [receipt({ ksef_number: 'OTHER', status: 'downloaded' })];
    await expect(runDownloadUpo(event, context)).rejects.toThrow('zaakceptowanej');
    expect(writes()).toEqual([]); expectNoExternalEffects();
  });
  it('validates the invoice before the already-downloaded fast path', async () => {
    tables.upo_receipts = [receipt({ status: 'downloaded' })]; tables.invoices[0].tenant_id = B;
    await expect(runDownloadUpo(event, context)).rejects.toThrow('zaakceptowanej');
    expectNoExternalEffects(); expect(writes()).toEqual([]);
  });
  it('preserves idempotent success for a verified downloaded receipt', async () => {
    tables.upo_receipts = [receipt({ status: 'downloaded' })];
    await expect(runDownloadUpo(event, context)).resolves.toMatchObject({ skipped: true });
    expectNoExternalEffects(); expect(writes()).toEqual([]);
  });
  it('fails closed on a transient invoice lookup failure without private diagnostics or mutation', async () => {
    errors.add('invoices');
    await expect(runDownloadUpo(event, context)).rejects.toThrow('Nie można sprawdzić faktury');
    expect(writes()).toEqual([]); expectNoExternalEffects();
  });
  it('rechecks a cached receipt against the current row before using a cached download', async () => {
    tables.upo_receipts = [receipt({ invoice_id: OTHER })];
    const cached = cachedContext({ 'upsert-upo-record': receipt(), 'download-from-ksef': { success: true, upoXml: '<cached/>' } });
    await expect(runDownloadUpo(event, cached)).rejects.toThrow('zaakceptowanej');
    expect(writes()).toEqual([]); expectNoExternalEffects();
  });
  it('rejects a cached upsert record from another organization before any effect', async () => {
    tables.upo_receipts = [receipt()];
    await expect(runDownloadUpo(event, cachedContext({ 'upsert-upo-record': receipt({ tenant_id: B }) }))).rejects.toThrow('zaakceptowanej');
    expect(writes()).toEqual([]); expectNoExternalEffects();
  });
  it('stops before storage if receipt ownership changes while KSeF is responding', async () => {
    tables.upo_receipts = [receipt()];
    mocks.download.mockImplementation(async () => {
      tables.upo_receipts[0].tenant_id = B;
      return { success: true, upoXml: '<test/>', upoXmlHash: 'hash', acceptanceTimestamp: '2026-01-01' };
    });
    await expect(runDownloadUpo(event, context)).rejects.toThrow('zaakceptowanej');
    expect(mocks.xml).not.toHaveBeenCalled(); expect(mocks.pdf).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
    expect(tables.upo_receipts[0].status).toBe('pending');
  });
  it('does not upload a PDF if the invoice changes during generation', async () => {
    mocks.render.mockImplementation(async () => { tables.invoices[0].tenant_id = B; return Buffer.from('test'); });
    await expect(runDownloadUpo(event, context)).rejects.toThrow('zaakceptowanej');
    expect(mocks.xml).toHaveBeenCalledTimes(1); expect(mocks.pdf).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('downloads and finalizes a valid receipt with every update scoped to all identity fields', async () => {
    await expect(runDownloadUpo(event, context)).resolves.toMatchObject({ success: true });
    expect(mocks.download).toHaveBeenCalledWith(A, REF, { invoiceId: ID });
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ sellerName: 'Test seller', buyerName: 'Test buyer' }));
    expect(tables.upo_receipts[0].status).toBe('downloaded');
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    for (const q of calls.filter((q) => q.table === 'invoices')) {
      for (const filter of [['id', ID], ['tenant_id', A], ['ksef_number', REF], ['ksef_status', 'accepted']]) expect(q.filters).toContainEqual(filter);
    }
    for (const q of writes().filter((q) => q.operation === 'update')) {
      for (const filter of [['id', RECEIPT], ['tenant_id', A], ['invoice_id', ID], ['ksef_number', REF]]) expect(q.filters).toContainEqual(filter);
    }
  });
  it('keeps retriable download failures and attempt accounting bounded to the receipt', async () => {
    tables.upo_receipts = [receipt({ status: 'failed', download_attempts: 3 })];
    mocks.download.mockResolvedValue({ success: false, error: 'test-downstream-failure', retryable: true });
    await expect(runDownloadUpo(event, context)).rejects.toThrow('test-downstream-failure');
    expect(tables.upo_receipts[0]).toMatchObject({ status: 'failed', download_attempts: 4 });
    expect(mocks.xml).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('can resume a corrected quarantined receipt only after complete validation', async () => {
    tables.upo_receipts = [receipt({ status: 'failed', last_error: UPO_IDENTITY_MISMATCH })];
    await runDownloadUpo(event, context);
    expect(tables.upo_receipts[0]).toMatchObject({ status: 'downloaded', last_error: null });
  });
});

describe('UPO retry cron boundaries', () => {
  it.each(['', ' '.repeat(3), 'X'.repeat(201)])('quarantines a freshly confirmed malformed reference without blocking its valid neighbor', async (ksef_number) => {
    tables.invoices = [invoice(), invoice({ id: OTHER })];
    tables.upo_receipts = [receipt({ ksef_number }), receipt({ id: OTHER, invoice_id: OTHER })];
    await expect(runUpoRetryStale(context)).resolves.toMatchObject({ dispatched: 1, quarantined: 1 });
    expect(tables.upo_receipts[0].last_error).toBe(UPO_IDENTITY_MISMATCH);
    expect(sendEvent).toHaveBeenCalledWith('re-request-upo', [{ name: 'invoice/upo.requested', data: { ...event, invoiceId: OTHER } }]);
  });
  it('lets a valid receipt past a full malformed batch on the following run', async () => {
    tables.invoices = [invoice(), invoice({ id: OTHER })];
    tables.upo_receipts = Array.from({ length: 100 }, (_, i) => receipt({ id: '44444444-4444-4444-8444-' + String(i).padStart(12, '0'), ksef_number: '' }));
    tables.upo_receipts.push(receipt({ id: OTHER, invoice_id: OTHER }));
    await expect(runUpoRetryStale(context)).resolves.toMatchObject({ processed: 100, quarantined: 100, dispatched: 0 });
    await expect(runUpoRetryStale(context)).resolves.toMatchObject({ processed: 1, quarantined: 0, dispatched: 1 });
  });
  it('skips impossible cached UUIDs without blocking valid candidates or writing unknown rows', async () => {
    tables.upo_receipts = [receipt()];
    const valid = { ...receipt(), invoices: invoice() };
    await expect(runUpoRetryStale(cachedContext({ 'find-stale-upo': [{ ...valid, id: 'bad' }, valid] }))).resolves.toMatchObject({ dispatched: 1, quarantined: 0 });
    expect(writes()).toEqual([]);
  });

  it('quarantines a confirmed wrong-tenant relation and dispatches the valid neighboring receipt', async () => {
    tables.invoices = [invoice({ tenant_id: B }), invoice({ id: OTHER })];
    tables.upo_receipts = [receipt(), receipt({ id: OTHER, invoice_id: OTHER })];
    await expect(runUpoRetryStale(context)).resolves.toMatchObject({ dispatched: 1, quarantined: 1 });
    expect(tables.upo_receipts[0]).toMatchObject({ status: 'failed', last_error: UPO_IDENTITY_MISMATCH });
    expect(sendEvent).toHaveBeenCalledWith('re-request-upo', [{ name: 'invoice/upo.requested', data: { ...event, invoiceId: OTHER } }]);
    expect(writes()[0].filters).toEqual([['id', RECEIPT], ['tenant_id', A], ['invoice_id', ID], ['ksef_number', REF], ['status', 'pending']]);
  });
  it.each([{ ksef_number: 'OTHER' }, { ksef_status: 'sending' }])('never dispatches a receipt whose invoice changed: %j', async (patch) => {
    tables.invoices = [invoice(patch)]; tables.upo_receipts = [receipt()];
    await expect(runUpoRetryStale(context)).resolves.toMatchObject({ dispatched: 0, quarantined: 1 });
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('does not starve a valid receipt behind a full invalid batch on the next run', async () => {
    tables.invoices = [invoice({ tenant_id: B }), invoice({ id: OTHER })];
    tables.upo_receipts = Array.from({ length: 100 }, (_, i) => receipt({ id: '44444444-4444-4444-8444-' + String(i).padStart(12, '0') }));
    tables.upo_receipts.push(receipt({ id: OTHER, invoice_id: OTHER }));
    await expect(runUpoRetryStale(context)).resolves.toMatchObject({ processed: 100, quarantined: 100, dispatched: 0 });
    await expect(runUpoRetryStale(context)).resolves.toMatchObject({ processed: 1, quarantined: 0, dispatched: 1 });
    expect(sendEvent).toHaveBeenCalledTimes(1);
  });
  it('never quarantines or dispatches when invoice verification is unavailable', async () => {
    tables.upo_receipts = [receipt()]; errors.add('invoices');
    await expect(runUpoRetryStale(context)).rejects.toThrow('Nie można sprawdzić faktury');
    expect(writes()).toEqual([]); expect(sendEvent).not.toHaveBeenCalled();
    expect(tables.upo_receipts[0].status).toBe('pending');
  });
  it('does not trust an old cached joined invoice after the database relation changes', async () => {
    const candidate = { ...receipt(), invoices: invoice() };
    tables.upo_receipts = [receipt()]; tables.invoices[0].tenant_id = B;
    await expect(runUpoRetryStale(cachedContext({ 'find-stale-upo': [candidate] }))).resolves.toMatchObject({ dispatched: 0, quarantined: 1 });
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('leaves a concurrently repaired receipt untouched by the quarantine write', async () => {
    tables.invoices = [invoice({ tenant_id: B }), invoice({ id: OTHER })];
    tables.upo_receipts = [receipt()];
    beforeQuery = (q) => {
      if (q.operation === 'update' && q.patch?.last_error === UPO_IDENTITY_MISMATCH) tables.upo_receipts[0].invoice_id = OTHER;
    };
    await expect(runUpoRetryStale(context)).resolves.toMatchObject({ quarantined: 0, dispatched: 0 });
    expect(tables.upo_receipts[0]).toMatchObject({ invoice_id: OTHER, status: 'pending', last_error: null });
    beforeQuery = undefined;
    await expect(runUpoRetryStale(context)).resolves.toMatchObject({ dispatched: 1 });
  });
  it('does not act on a cached candidate whose identity has already been repaired', async () => {
    const candidate = { ...receipt(), invoices: invoice({ tenant_id: B }) };
    tables.invoices = [invoice({ id: OTHER })]; tables.upo_receipts = [receipt({ invoice_id: OTHER })];
    await expect(runUpoRetryStale(cachedContext({ 'find-stale-upo': [candidate] }))).resolves.toMatchObject({ quarantined: 0, dispatched: 0 });
    expect(writes()).toEqual([]); expect(sendEvent).not.toHaveBeenCalled();
  });
  it('does not turn a receipt-query outage into a permanent marker', async () => {
    const candidate = { ...receipt(), invoices: invoice({ tenant_id: B }) };
    errors.add('upo_receipts');
    await expect(runUpoRetryStale(cachedContext({ 'find-stale-upo': [candidate] }))).rejects.toThrow('ponownie sprawdzić');
    expect(writes()).toEqual([]); expect(sendEvent).not.toHaveBeenCalled();
  });
});
