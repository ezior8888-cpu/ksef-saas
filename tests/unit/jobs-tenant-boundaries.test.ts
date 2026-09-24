import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '@/lib/jobs/registry';
import type { Invoice } from '@/types/invoice';

type Row = Record<string, unknown>;
type Query = { table: string; operation: string; filters: Array<[string, unknown]>; patch?: Row };
const mocks = vi.hoisted(() => ({
  admin: vi.fn(), download: vi.fn(), metadata: vi.fn(), process: vi.fn(),
  photo: vi.fn(), ocr: vi.fn(), push: vi.fn(), email: vi.fn(), proposal: vi.fn(),
  health: vi.fn(), submit: vi.fn(), audit: vi.fn(), credentials: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/import/file-storage', () => ({ downloadImportFile: mocks.download }));
vi.mock('@/lib/ksef/history-fetcher', () => ({ fetchInvoicesMetadata: mocks.metadata, fetchInvoiceXml: vi.fn() }));
vi.mock('@/lib/import/import-engine', () => ({ processImportedInvoices: mocks.process }));
vi.mock('@/lib/storage/expenses', () => ({ downloadExpensePhoto: mocks.photo }));
vi.mock('@/lib/ocr/engine', () => ({ extractInvoiceFromImage: mocks.ocr }));
vi.mock('@/lib/push/sender', () => ({ sendPushToUser: mocks.push }));
vi.mock('@/lib/email/send', () => ({ sendInvoiceAcceptedEmail: mocks.email, sendInvoiceFailedEmail: mocks.email }));
vi.mock('@/lib/flo/proposals', () => ({ createProposal: mocks.proposal }));
vi.mock('@/lib/ksef/health-check', () => ({ checkKsefAvailability: mocks.health, shouldUseOfflineMode: mocks.health }));
vi.mock('@/lib/ksef/submit-invoice-full', () => ({ submitInvoiceFullFlow: mocks.submit }));
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: vi.fn() }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: vi.fn() }));
vi.mock('@/lib/categorization', () => ({ categorizeExpense: vi.fn() }));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerificationForBackgroundJob: vi.fn(),
  KsefNotVerifiedError: class KsefNotVerifiedError extends Error {},
}));
vi.mock('@/lib/xml/fa3-generator', () => ({ InvoiceValidationError: class InvoiceValidationError extends Error {} }));

import { requireInvoiceTenant, requireImportJobTenant } from '@/lib/inngest/jobs/tenant-boundary';
import { getInvoiceForSubmit, updateInvoiceStatus } from '@/lib/supabase/admin-queries';
import { onBulkImportExhausted, runBulkImportFile } from '@/lib/inngest/jobs/bulk-import';
import { onMagicImportExhausted, runMagicImportKsef } from '@/lib/inngest/jobs/magic-import-ksef';
import { runNotifySuccess, runNotifyFailure } from '@/lib/inngest/jobs/notify-user';
import { runProcessOcr } from '@/lib/inngest/jobs/process-ocr';
import { runSendReminder } from '@/lib/inngest/jobs/send-reminder';
import { runProcessOfflineQueue, runOfflineQueueSuccess, runOfflineQueueFailure } from '@/lib/inngest/jobs/process-offline-queue';
import { runSubmitInvoice, onSubmitInvoiceExhausted } from '@/lib/inngest/jobs/submit-invoice';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
let tables: Record<string, Row[]>;
let errors: Set<string>;
let calls: Query[];
const writes = () => calls.filter((q) => q.operation !== 'select');
function client() {
  return { from(table: string) {
    const q: Query = { table, operation: 'select', filters: [] };
    calls.push(q);
    let one = false;
    let maxRows = Infinity;
    const execute = () => {
      if (errors.has(table)) return { data: null, error: { message: 'private-db-error' } };
      const rows = (tables[table] ?? []).filter((row) => q.filters.every(([key, val]) => row[key] === val)).slice(0, maxRows);
      if (q.operation === 'update') rows.forEach((row) => Object.assign(row, q.patch));
      if (q.operation === 'insert') { (tables[table] ??= []).push({ ...q.patch }); }
      return { data: one ? rows[0] ?? null : rows, error: null, count: rows.length };
    };
    const builder = {
      select: () => builder, eq: (key: string, val: unknown) => { q.filters.push([key, val]); return builder; },
      update: (patch: Row) => { q.operation = 'update'; q.patch = patch; return builder; },
      insert: (patch: Row) => { q.operation = 'insert'; q.patch = patch; return builder; },
      lte: () => builder, order: () => builder, limit: (count: number) => { maxRows = count; return builder; },
      single: () => { one = true; return Promise.resolve(execute()); },
      maybeSingle: () => { one = true; return Promise.resolve(execute()); },
      then: <TResult1 = ReturnType<typeof execute>, TResult2 = never>(
        resolve?: ((value: ReturnType<typeof execute>) => TResult1 | PromiseLike<TResult1>) | null,
        reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve(execute()).then(resolve, reject),
    };
    return builder;
  }, auth: { admin: { getUserById: vi.fn() } } };
}
const sendEvent = vi.fn();
const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: {
    run: async (_name, fn) => fn(), sleep: vi.fn(), sendEvent,
    scheduleAfter: vi.fn(),
  },
};
const fileEvent = { importJobId: ID, tenantId: A, source: 'jpk_fa' as const, filePath: 'imports/' + A + '/input.xml' };
const magicEvent = { importJobId: ID, tenantId: A, nip: '1234567890', dateFrom: '2026-01-01', dateTo: '2026-09-01', direction: 'issued' as const };
const submitEvent = { invoiceId: ID, tenantId: A, nip: '1234567890', invoice: { internalNumber: 'TEST-1' } as Invoice };
beforeEach(() => {
  vi.clearAllMocks();
  tables = {}; errors = new Set(); calls = [];
  mocks.admin.mockImplementation(client);
  mocks.health.mockResolvedValue({ available: true });
  mocks.metadata.mockResolvedValue({ totalCount: 0, invoices: [] });
});

describe('service-role job boundaries', () => {
  it('confirms a matching invoice update and normalizes empty timestamps', async () => {
    tables.invoices = [{ id: ID, tenant_id: A }];
    await updateInvoiceStatus(ID, { ksef_status: 'sending', submitted_to_ksef_at: '' }, A);
    expect(tables.invoices[0]).toMatchObject({ ksef_status: 'sending', submitted_to_ksef_at: null });
  });
  it('does not quarantine any row when invoice ownership lookup is unavailable', async () => {
    tables.ksef_offline_queue = [{ id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued', deadline: '2000-01-01' }];
    errors.add('invoices');
    await expect(runProcessOfflineQueue(ctx)).rejects.toThrow('Nie można sprawdzić');
    expect(writes()).toEqual([]); expect(sendEvent).not.toHaveBeenCalled();
    expect(tables.ksef_offline_queue[0].status).toBe('queued');
  });
  it('quarantines a full malicious batch so a valid row is not starved on the next run', async () => {
    tables.invoices = [{ id: ID, tenant_id: B }, { id: OTHER, tenant_id: A }];
    tables.ksef_offline_queue = Array.from({ length: 10 }, (_, index) => ({
      id: '44444444-4444-4444-8444-' + String(index).padStart(12, '0'),
      tenant_id: A, invoice_id: ID, status: 'queued', deadline: '2000-01-01',
    }));
    tables.ksef_offline_queue.push({ id: USER, tenant_id: A, invoice_id: OTHER, status: 'queued', deadline: '2000-01-01' });
    await runProcessOfflineQueue(ctx);
    expect(tables.ksef_offline_queue.filter((r) => r.status === 'failed')).toHaveLength(10);
    expect(tables.ksef_offline_queue[10].status).toBe('queued');
    await runProcessOfflineQueue(ctx);
    expect(tables.ksef_offline_queue[10].status).toBe('expired');
    expect(tables.invoices[0]).toEqual({ id: ID, tenant_id: B });
  });
  it('rejects legacy reminder consent before restoring an old durable fetch', async () => {
    const cached = { id: ID, tenant_id: A, invoice_id: OTHER, status: 'pending', invoices: { id: OTHER, tenant_id: B } };
    const cachedContext = { ...ctx, step: { ...ctx.step, run: vi.fn().mockResolvedValue(cached) } };
    await expect(runSendReminder({ reminderId: ID, approvalId: 'approved' }, cachedContext)).rejects.toThrow('zgody');
    expect(cachedContext.step.run).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
  it('rejects invalid IDs before constructing an admin client', async () => {
    await expect(requireInvoiceTenant('not-an-id', A)).rejects.toThrow('tożsamość');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('fails closed on lookup errors, without reflecting DB diagnostics', async () => {
    errors.add('invoices');
    await expect(requireInvoiceTenant(ID, A)).rejects.toThrow('Nie można sprawdzić');
    expect(writes()).toEqual([]);
  });
  it('checks the tenant of an invoice, not only the validity of its ID', async () => {
    tables.invoices = [{ id: ID, tenant_id: B }];
    await expect(requireInvoiceTenant(ID, A)).rejects.toThrow('nie należy');
    expect(calls[0].filters).toContainEqual(['tenant_id', A]);
  });
  it('requires the same source and file path as the import record', async () => {
    tables.import_jobs = [{ id: ID, tenant_id: A, source: 'jpk_fa', source_file_path: 'old-path' }];
    await expect(requireImportJobTenant(ID, A, 'jpk_fa', 'different-path')).rejects.toThrow('źródła');
    await expect(requireImportJobTenant(ID, A, 'ksef_history')).rejects.toThrow('źródła');
    expect(writes()).toEqual([]);
  });
  it.each(['bulk', 'magic'] as const)('rejects a mismatched %s job before progress writes or downloads', async (kind) => {
    tables.import_jobs = [{ id: ID, tenant_id: B, source: 'jpk_fa' }];
    await expect(kind === 'bulk' ? runBulkImportFile(fileEvent, ctx) : runMagicImportKsef(magicEvent, ctx)).rejects.toThrow('nie należy');
    expect(writes()).toEqual([]);
    expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it.each([onBulkImportExhausted, onMagicImportExhausted])('never mutates an unrelated import in its failure callback', async (handler) => {
    tables.import_jobs = [{ id: ID, tenant_id: B, status: 'pending' }];
    await expect(handler(new Error('private-error'), { importJobId: ID, tenantId: A })).rejects.toThrow('nie należy');
    expect(writes()).toEqual([]);
    expect(tables.import_jobs[0].status).toBe('pending');
  });
  it.each([onBulkImportExhausted, onMagicImportExhausted])('preserves scoped import failure handling without leaking the exception', async (handler) => {
    tables.import_jobs = [{ id: ID, tenant_id: A, status: 'pending' }];
    await handler(new Error('private-error'), { importJobId: ID, tenantId: A });
    expect(tables.import_jobs[0].status).toBe('failed');
    expect(writes()[0].filters).toContainEqual(['tenant_id', A]);
    expect(JSON.stringify(writes())).not.toContain('private-error');
  });
  it('preserves empty successful magic imports and scopes every update', async () => {
    tables.import_jobs = [{ id: ID, tenant_id: A, source: 'ksef_history' }];
    await expect(runMagicImportKsef(magicEvent, ctx)).resolves.toEqual({ success: true, imported: 0 });
    expect(writes().length).toBeGreaterThan(0);
    for (const q of writes()) expect(q.filters).toContainEqual(['tenant_id', A]);
  });
  it.each(['success', 'failure'] as const)('rejects a mismatched %s notification before cards, mail or push', async (kind) => {
    tables.invoices = [{ id: ID, tenant_id: B }];
    await expect(kind === 'success'
      ? runNotifySuccess({ invoiceId: ID, tenantId: A, ksefNumber: 'test' }, ctx)
      : runNotifyFailure({ invoiceId: ID, tenantId: A, error: 'test' }, ctx)).rejects.toThrow('nie należy');
    expect(mocks.proposal).not.toHaveBeenCalled(); expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
  it('rejects an own reminder joined to another organization invoice', async () => {
    tables.payment_reminders = [{
      id: ID, tenant_id: A, invoice_id: OTHER, status: 'pending',
      invoices: { id: OTHER, tenant_id: B, gross_total: 100, paid_amount: 0 },
    }];
    await expect(runSendReminder({ reminderId: ID, approvalId: 'approved' }, ctx)).rejects.toThrow('zgody');
    expect(writes()).toEqual([]);
    expect(calls).toEqual([]);
  });
  it('does not mutate a paid reminder when legacy queue data has no durable consent', async () => {
    tables.payment_reminders = [{
      id: ID, tenant_id: A, invoice_id: OTHER, status: 'pending',
      invoices: { id: OTHER, tenant_id: A, gross_total: 100, paid_amount: 100 },
    }];
    await expect(runSendReminder({ reminderId: ID, approvalId: 'approved' }, ctx)).rejects.toThrow('zgody');
    expect(writes()).toEqual([]);
    expect(tables.payment_reminders[0].status).toBe('pending');
  });
  it('blocks a tampered OCR created_by before photo download, AI or push', async () => {
    tables.ocr_jobs = [{ id: ID, tenant_id: A, created_by: USER, source_file_path: 'tenants/' + A + '/x.jpg' }];
    tables.memberships = [{ user_id: USER, organization_id: B, status: 'active' }];
    await expect(runProcessOcr({ ocrJobId: ID, tenantId: A }, ctx)).rejects.toThrow('Odbiorca nie należy');
    expect(mocks.photo).not.toHaveBeenCalled(); expect(mocks.ocr).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
    expect(writes().every((q) => q.table === 'ocr_jobs')).toBe(true);
  });
  it.each(['2000-01-01', '2099-01-01'])('ignores an own offline row referencing another tenant invoice, deadline=%s', async (deadline) => {
    tables.ksef_offline_queue = [{ id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued', deadline }];
    tables.invoices = [{ id: ID, tenant_id: B }];
    const result = await runProcessOfflineQueue(ctx);
    expect(result).toMatchObject({ processed: 1, results: [{ status: 'ownership-mismatch' }] });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({ table: 'ksef_offline_queue', patch: { status: 'failed' } });
    expect(writes()[0].filters).toEqual([['id', OTHER], ['tenant_id', A], ['invoice_id', ID], ['status', 'queued']]);
    expect(tables.invoices[0]).toEqual({ id: ID, tenant_id: B });
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('expires a valid offline row and scopes both updates', async () => {
    tables.ksef_offline_queue = [{ id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued', deadline: '2000-01-01' }];
    tables.invoices = [{ id: ID, tenant_id: A }];
    await runProcessOfflineQueue(ctx);
    expect(tables.ksef_offline_queue[0].status).toBe('expired');
    expect(tables.invoices[0].ksef_status).toBe('failed');
    for (const q of writes()) expect(q.filters).toContainEqual(['tenant_id', A]);
  });
  it.each(['success', 'failure'] as const)('rejects mismatched offline %s callbacks', async (kind) => {
    tables.invoices = [{ id: ID, tenant_id: B }];
    await expect(kind === 'success'
      ? runOfflineQueueSuccess({ invoiceId: ID, tenantId: A, fromOfflineQueue: true, ksefNumber: 'test' }, ctx)
      : runOfflineQueueFailure({ invoiceId: ID, tenantId: A, fromOfflineQueue: true, error: 'test' }, ctx)).rejects.toThrow('nie należy');
    expect(writes()).toEqual([]);
  });
  it('scopes a valid success callback instead of completing a second tenant queue row', async () => {
    tables.invoices = [{ id: ID, tenant_id: A }];
    tables.ksef_offline_queue = [
      { id: ID, tenant_id: A, invoice_id: ID, status: 'sending' },
      { id: OTHER, tenant_id: B, invoice_id: ID, status: 'sending' },
    ];
    await runOfflineQueueSuccess({ invoiceId: ID, tenantId: A, fromOfflineQueue: true, ksefNumber: 'test' }, ctx);
    expect(tables.ksef_offline_queue.map((r) => r.status)).toEqual(['sent', 'sending']);
  });
  it.each(['runner', 'failure'] as const)('rejects mismatched submit %s before any write, mail, KSeF or event', async (kind) => {
    tables.invoices = [{ id: ID, tenant_id: B }];
    await expect(kind === 'runner' ? runSubmitInvoice(submitEvent, ctx) : onSubmitInvoiceExhausted(new Error('failed'), submitEvent, ctx)).rejects.toThrow('nie należy');
    expect(writes()).toEqual([]); expect(sendEvent).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('does not let a malformed event get privileged failure handling', async () => {
    await expect(onSubmitInvoiceExhausted(new Error('failed'), {} as typeof submitEvent, ctx)).resolves.toMatchObject({ handled: false });
    expect(mocks.admin).not.toHaveBeenCalled(); expect(sendEvent).not.toHaveBeenCalled();
  });
  it('preserves submit idempotency for the matching tenant', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'accepted', ksef_number: 'TEST' }];
    await expect(runSubmitInvoice(submitEvent, ctx)).resolves.toEqual({ alreadyAccepted: true, ksefNumber: 'TEST' });
    expect(writes()).toEqual([]); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('invoice read/write helpers require tenant and never affect a foreign row', async () => {
    tables.invoices = [{ id: ID, tenant_id: B, fa3_data: { internalNumber: 'PRIVATE' }, ksef_status: 'accepted' }];
    await expect(getInvoiceForSubmit(ID, A)).rejects.toThrow('no fa3_data');
    await expect(updateInvoiceStatus(ID, { ksef_status: 'failed' }, A)).rejects.toThrow('Nie udało się zaktualizować');
    expect(tables.invoices[0].ksef_status).toBe('accepted');
    await expect(updateInvoiceStatus(ID, { ksef_status: 'failed' }, '')).rejects.toThrow('Brak organizacji');
    expect(calls.filter((q) => q.table === 'invoices').every((q) => q.filters.some(([k,v]) => k === 'tenant_id' && v === A))).toBe(true);
  });
});
