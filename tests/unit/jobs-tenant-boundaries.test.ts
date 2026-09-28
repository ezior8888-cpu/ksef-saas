import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '@/lib/jobs/registry';
import type { Invoice } from '@/types/invoice';
import type { AdvanceInvoiceData } from '@/types/invoice-types';
import { sellerPartyFromSellerData } from '@/lib/invoices/map-buyer-party';

type Row = Record<string, unknown>;
type Query = { table: string; operation: string; filters: Array<[string, unknown]>; patch?: Row };
const mocks = vi.hoisted(() => ({
  admin: vi.fn(), download: vi.fn(), metadata: vi.fn(), process: vi.fn(),
  photo: vi.fn(), ocr: vi.fn(), push: vi.fn(), email: vi.fn(), proposal: vi.fn(),
  health: vi.fn(), submit: vi.fn(), audit: vi.fn(), credentials: vi.fn(), offlineAdd: vi.fn(),
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
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: mocks.offlineAdd }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: vi.fn() }));
vi.mock('@/lib/categorization', () => ({ categorizeExpense: vi.fn() }));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerificationForBackgroundJob: vi.fn(),
  KsefNotVerifiedError: class KsefNotVerifiedError extends Error {},
}));
vi.mock('@/lib/xml/fa3-generator', () => ({ InvoiceValidationError: class InvoiceValidationError extends Error {} }));

import { requireInvoiceTenant, requireImportJobTenant } from '@/lib/inngest/jobs/tenant-boundary';
import { claimInvoiceForKsefSend, getInvoiceForSubmit, updateInvoiceStatus } from '@/lib/supabase/admin-queries';
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
    let head = false;
    let orPredicate: ((row: Row) => boolean) | null = null;
    const extraPredicates: Array<(row: Row) => boolean> = [];
    const execute = () => {
      if (errors.has(table)) return { data: null, error: { message: 'private-db-error' } };
      const rows = (tables[table] ?? []).filter((row) =>
        q.filters.every(([key, val]) => row[key] === val) &&
        extraPredicates.every((predicate) => predicate(row)) &&
        (!orPredicate || orPredicate(row))).slice(0, maxRows);
      if (q.operation === 'update') rows.forEach((row) => Object.assign(row, q.patch));
      if (q.operation === 'insert') { (tables[table] ??= []).push({ ...q.patch }); }
      return { data: head ? null : one ? rows[0] ?? null : rows, error: null, count: rows.length };
    };
    const builder = {
      select: (_columns?: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return builder; },
      eq: (key: string, val: unknown) => { q.filters.push([key, val]); return builder; },
      in: (key: string, values: unknown[]) => {
        extraPredicates.push((row) => values.includes(row[key]));
        return builder;
      },
      is: (key: string, value: unknown) => {
        extraPredicates.push((row) => value === null ? row[key] == null : row[key] === value);
        return builder;
      },
      or: (filter: string) => {
        const match = /^ksef_environment\.is\.null,ksef_environment\.neq\.(test|demo|production)$/.exec(filter);
        if (!match) throw new Error(`Unexpected OR filter ${filter}`);
        orPredicate = (row) => row.ksef_environment == null || row.ksef_environment !== match[1];
        return builder;
      },
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
const magicEvent = { importJobId: ID, tenantId: A, nip: '1234567890', environment: 'test' as const, dateFrom: '2026-01-01', dateTo: '2026-09-01', direction: 'issued' as const };
const submitEvent = { invoiceId: ID, tenantId: A, nip: '1234567890', environment: 'test' as const, invoice: { internalNumber: 'TEST-1' } as Invoice };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KSEF_ENV', 'test');
  tables = {}; errors = new Set(); calls = [];
  mocks.admin.mockImplementation(client);
  mocks.health.mockResolvedValue({ available: true });
  mocks.metadata.mockResolvedValue({ totalCount: 0, invoices: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe('service-role job boundaries', () => {
  it('atomically gives the KSeF sending claim to only one worker', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, direction: 'outgoing', ksef_status: 'queued',
      submitted_to_ksef_at: null, submission_attempts: 0, ksef_environment: null }];
    expect(await claimInvoiceForKsefSend(ID, A, false)).toEqual(expect.any(String));
    expect(await claimInvoiceForKsefSend(ID, A, false)).toBeNull();
    expect(tables.invoices[0].ksef_status).toBe('sending');
    expect(tables.invoices[0].submitted_to_ksef_at).toEqual(expect.any(String));
    expect(writes()).toHaveLength(2);
  });
  it('never claims an incoming draft even if its delivery state looks fresh', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, direction: 'incoming', ksef_status: 'draft',
      submitted_to_ksef_at: null, submission_attempts: 0, ksef_environment: null }];
    expect(await claimInvoiceForKsefSend(ID, A, false)).toBeNull();
    expect(tables.invoices[0].ksef_status).toBe('draft');
  });
  it.each(['failed', 'rejected'])('does not claim a historical %s row with no timestamp', async (status) => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: status, submitted_to_ksef_at: null }];
    expect(await claimInvoiceForKsefSend(ID, A, false)).toBeNull();
    expect(tables.invoices[0].ksef_status).toBe(status);
  });
  it('does not claim a historical Offline24 row even with no timestamp', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'offline_queued', submitted_to_ksef_at: null }];
    expect(await claimInvoiceForKsefSend(ID, A, true)).toBeNull();
    expect(writes()).toEqual([]);
  });
  it('does not claim a historical draft with an earlier attempt trace', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'draft', submitted_to_ksef_at: null,
      submission_attempts: 0, last_attempt_at: '2026-09-01T10:00:00Z', ksef_environment: null }];
    expect(await claimInvoiceForKsefSend(ID, A, false)).toBeNull();
    expect(tables.invoices[0].ksef_status).toBe('draft');
  });
  it('confirms a matching invoice update and normalizes empty timestamps', async () => {
    tables.invoices = [{ id: ID, tenant_id: A }];
    await updateInvoiceStatus(ID, { ksef_status: 'sending', submitted_to_ksef_at: '' }, A);
    expect(tables.invoices[0]).toMatchObject({ ksef_status: 'sending', submitted_to_ksef_at: null });
  });
  it('does not quarantine any row when invoice ownership lookup is unavailable', async () => {
    tables.ksef_offline_queue = [{ id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued', ksef_environment: 'test', deadline: '2000-01-01' }];
    errors.add('invoices');
    await expect(runProcessOfflineQueue(ctx)).rejects.toThrow('Nie można sprawdzić');
    expect(writes()).toEqual([]); expect(sendEvent).not.toHaveBeenCalled();
    expect(tables.ksef_offline_queue[0].status).toBe('queued');
  });
  it('quarantines a full malicious batch so a valid row is not starved on the next run', async () => {
    tables.invoices = [{ id: ID, tenant_id: B }, {
      id: OTHER, tenant_id: A, ksef_status: 'offline_queued', submitted_to_ksef_at: null,
      invoice_kind: 'regular', invoice_type: 'VAT', fa3_data: { type: 'VAT' },
    }];
    tables.ksef_offline_queue = Array.from({ length: 10 }, (_, index) => ({
      id: '44444444-4444-4444-8444-' + String(index).padStart(12, '0'),
      tenant_id: A, invoice_id: ID, status: 'queued', ksef_environment: 'test', deadline: '2000-01-01',
    }));
    tables.ksef_offline_queue.push({ id: USER, tenant_id: A, invoice_id: OTHER, status: 'queued', ksef_environment: 'test', deadline: '2000-01-01' });
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
  it('rejects a stale KSeF history import event before any DB or API effect', async () => {
    await expect(runMagicImportKsef({ ...magicEvent, environment: 'demo' }, ctx)).rejects.toThrow('environment');
    expect(calls).toEqual([]);
    expect(mocks.metadata).not.toHaveBeenCalled();
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
      ? runNotifySuccess({ invoiceId: ID, tenantId: A, ksefNumber: 'test', environment: 'test' }, ctx)
      : runNotifyFailure({ invoiceId: ID, tenantId: A, error: 'test', environment: 'test' }, ctx)).rejects.toThrow('nie należy');
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
    tables.ksef_offline_queue = [{ id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued', ksef_environment: 'test', deadline }];
    tables.invoices = [{ id: ID, tenant_id: B }];
    const result = await runProcessOfflineQueue(ctx);
    expect(result).toMatchObject({ processed: 1, results: [{ status: 'ownership-mismatch' }] });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({ table: 'ksef_offline_queue', patch: { status: 'failed' } });
    expect(writes()[0].filters).toEqual([['id', OTHER], ['tenant_id', A], ['invoice_id', ID], ['status', 'queued']]);
    expect(tables.invoices[0]).toEqual({ id: ID, tenant_id: B });
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('does not emit or mutate legacy and foreign-environment offline rows', async () => {
    tables.ksef_offline_queue = [
      { id: ID, tenant_id: A, invoice_id: ID, status: 'queued', ksef_environment: null, deadline: '2099-01-01' },
      { id: OTHER, tenant_id: A, invoice_id: OTHER, status: 'queued', ksef_environment: 'demo', deadline: '2099-01-01' },
    ];
    await expect(runProcessOfflineQueue(ctx)).resolves.toMatchObject({ skipped: true, reason: 'Empty queue' });
    expect(writes()).toEqual([]);
    expect(sendEvent).not.toHaveBeenCalled();
    expect(ctx.logger.error).toHaveBeenCalledWith('Offline24 rows require environment reconciliation', {
      environment: 'test', blockedCount: 2,
    });
  });

  it('expires a valid offline row and scopes both updates', async () => {
    tables.ksef_offline_queue = [{ id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued', ksef_environment: 'test', deadline: '2000-01-01' }];
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'offline_queued', submitted_to_ksef_at: null,
      invoice_kind: 'regular', invoice_type: 'VAT', fa3_data: { type: 'VAT' },
    }];
    await runProcessOfflineQueue(ctx);
    expect(tables.ksef_offline_queue[0].status).toBe('expired');
    expect(tables.invoices[0].ksef_status).toBe('failed');
    for (const q of writes()) expect(q.filters).toContainEqual(['tenant_id', A]);
  });
  it('does not mark accepted invoice failed when Offline24 deadline races with acceptance', async () => {
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued',
      ksef_environment: 'test', deadline: '2000-01-01',
    }];
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'offline_queued', submitted_to_ksef_at: null,
      invoice_kind: 'regular', invoice_type: 'VAT', fa3_data: { type: 'VAT' },
    }];
    const racingContext: JobContext = {
      ...ctx,
      step: {
        ...ctx.step,
        run: async <T,>(name: string, fn: () => Promise<T> | T): Promise<T> => {
          if (name.startsWith('expire-offline-queue-')) {
            tables.invoices[0].ksef_status = 'accepted';
            tables.invoices[0].ksef_number = 'TEST-KSEF-NUMBER';
          }
          return fn();
        },
      },
    };
    await expect(runProcessOfflineQueue(racingContext))
      .resolves.toMatchObject({ processed: 1, results: [{ status: 'expired-reconciliation' }] });
    expect(tables.invoices[0]).toMatchObject({
      ksef_status: 'accepted', ksef_number: 'TEST-KSEF-NUMBER',
    });
    expect(tables.ksef_offline_queue[0].status).toBe('expired');
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('expires a historical queue row without changing a sending invoice', async () => {
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued',
      ksef_environment: 'test', deadline: '2000-01-01',
    }];
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'sending',
      submitted_to_ksef_at: '2026-09-27T00:00:00.000Z',
    }];
    await expect(runProcessOfflineQueue(ctx)).resolves.toMatchObject({
      processed: 1, results: [{ status: 'expired-reconciliation' }],
    });
    expect(tables.ksef_offline_queue[0].status).toBe('expired');
    expect(tables.invoices[0]).toMatchObject({
      ksef_status: 'sending', submitted_to_ksef_at: '2026-09-27T00:00:00.000Z',
    });
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it('quarantines legacy PROD Offline24 rows without probing KSeF or sending', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued',
      ksef_environment: 'production', deadline: '2099-01-01',
    }];
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'offline_queued', submitted_to_ksef_at: null,
      invoice_kind: 'regular', invoice_type: 'VAT', fa3_data: { type: 'VAT' },
    }];
    await expect(runProcessOfflineQueue(ctx)).resolves.toMatchObject({
      processed: 1, results: [{ status: 'production-reconciliation' }],
    });
    expect(tables.ksef_offline_queue[0].status).toBe('failed');
    expect(tables.invoices[0]).toMatchObject({
      ksef_status: 'offline_queued', last_error_code: 'OFFLINE_PROD_QR_UNVERIFIED',
    });
    expect(mocks.health).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(2);
    expect(ctx.logger.error).toHaveBeenCalledWith(
      'PROD Offline24 QR is unverified; queued rows require manual reconciliation',
      { environment: 'production', queuedCount: 1 },
    );
  });
  it('quarantines a historical special Offline24 row before replay', async () => {
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued',
      ksef_environment: 'test', deadline: '2099-01-01',
    }];
    tables.invoices = [{
      id: ID, tenant_id: A, invoice_kind: 'correction', invoice_type: 'KOR',
      fa3_data: { type: 'KOR' }, ksef_status: 'offline_queued',
    }];
    const result = await runProcessOfflineQueue(ctx);
    expect(result).toMatchObject({ processed: 1, results: [{ status: 'special-reconciliation' }] });
    expect(tables.ksef_offline_queue[0].status).toBe('failed');
    expect(tables.invoices[0]).toMatchObject({
      ksef_status: 'offline_queued', last_error_code: 'OFFLINE_SPECIAL_DOCUMENT',
    });
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('closes a regular unexpired Offline24 row without creating a sending attempt', async () => {
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued',
      ksef_environment: 'test', deadline: '2099-01-01', attempts: 0,
    }];
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'offline_queued', submitted_to_ksef_at: null,
      invoice_kind: 'regular', invoice_type: 'VAT', fa3_data: { type: 'VAT' },
    }];
    await expect(runProcessOfflineQueue(ctx)).resolves.toMatchObject({
      processed: 1, results: [{ status: 'paused-reconciliation' }],
    });
    expect(tables.ksef_offline_queue[0]).toMatchObject({
      status: 'failed', attempts: 0, last_error: 'OFFLINE_REPLAY_PAUSED_REQUIRES_RECONCILIATION',
    });
    expect(tables.invoices[0]).toMatchObject({
      ksef_status: 'offline_queued', submitted_to_ksef_at: null,
      last_error_code: 'OFFLINE_REPLAY_PAUSED',
    });
    expect(writes().some((query) => query.patch?.status === 'sending')).toBe(false);
    expect(sendEvent).not.toHaveBeenCalled();
    await expect(runProcessOfflineQueue(ctx)).resolves.toMatchObject({ skipped: true, reason: 'Empty queue' });
  });
  it('completes an invoice marker after a previous attempt already quarantined the queue', async () => {
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued',
      ksef_environment: 'test', deadline: '2099-01-01',
    }];
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'offline_queued', submitted_to_ksef_at: null,
      invoice_kind: 'regular', invoice_type: 'VAT', fa3_data: { type: 'VAT' },
    }];
    const retryContext: JobContext = {
      ...ctx,
      step: {
        ...ctx.step,
        run: async <T,>(name: string, fn: () => Promise<T> | T): Promise<T> => {
          const result = await fn();
          if (name.startsWith('fetch-queue-items-')) {
            tables.ksef_offline_queue[0].status = 'failed';
            tables.ksef_offline_queue[0].last_error = 'OFFLINE_REPLAY_PAUSED_REQUIRES_RECONCILIATION';
          }
          return result;
        },
      },
    };
    await runProcessOfflineQueue(retryContext);
    expect(tables.invoices[0]).toMatchObject({ last_error_code: 'OFFLINE_REPLAY_PAUSED' });
    expect(tables.ksef_offline_queue[0].status).toBe('failed');
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it.each(['accepted', 'sending'] as const)(
    'quarantines an unexpired row without touching a %s invoice', async (status) => {
      tables.ksef_offline_queue = [{
        id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued',
        ksef_environment: 'test', deadline: '2099-01-01',
      }];
      tables.invoices = [{
        id: ID, tenant_id: A, ksef_status: status,
        submitted_to_ksef_at: '2026-09-27T00:00:00.000Z', ksef_number: 'TEST-NUMBER',
      }];
      await runProcessOfflineQueue(ctx);
      expect(tables.ksef_offline_queue[0].status).toBe('failed');
      expect(tables.invoices[0]).toMatchObject({
        ksef_status: status, submitted_to_ksef_at: '2026-09-27T00:00:00.000Z',
        ksef_number: 'TEST-NUMBER',
      });
      expect(writes().filter((query) => query.table === 'invoices')).toEqual([]);
      expect(sendEvent).not.toHaveBeenCalled();
    },
  );
  it('quarantines queued Offline24 work even while KSeF health reports an outage', async () => {
    mocks.health.mockResolvedValue({ available: false, error: 'KSeF unavailable', isMfOutage: false });
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued',
      ksef_environment: 'test', deadline: '2099-01-01',
    }];
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'offline_queued', submitted_to_ksef_at: null,
      invoice_kind: 'regular', invoice_type: 'VAT', fa3_data: { type: 'VAT' },
    }];
    await expect(runProcessOfflineQueue(ctx)).resolves.toMatchObject({
      processed: 1, results: [{ status: 'paused-reconciliation' }],
    });
    expect(tables.ksef_offline_queue[0].status).toBe('failed');
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('does not overwrite a newly sending invoice while quarantining its old queue row', async () => {
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'queued',
      ksef_environment: 'test', deadline: '2099-01-01',
    }];
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'offline_queued', submitted_to_ksef_at: null,
      invoice_kind: 'regular', invoice_type: 'VAT', fa3_data: { type: 'VAT' },
    }];
    const racingContext: JobContext = {
      ...ctx,
      step: {
        ...ctx.step,
        run: async <T,>(name: string, fn: () => Promise<T> | T): Promise<T> => {
          if (name.startsWith('quarantine-paused-offline-')) {
            tables.invoices[0].ksef_status = 'sending';
            tables.invoices[0].submitted_to_ksef_at = '2026-09-27T00:00:00.000Z';
          }
          return fn();
        },
      },
    };
    await runProcessOfflineQueue(racingContext);
    expect(tables.ksef_offline_queue[0].status).toBe('failed');
    expect(tables.invoices[0]).toMatchObject({
      ksef_status: 'sending', submitted_to_ksef_at: '2026-09-27T00:00:00.000Z',
    });
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it.each(['success', 'failure'] as const)('rejects mismatched offline %s callbacks', async (kind) => {
    tables.invoices = [{ id: ID, tenant_id: B }];
    await expect(kind === 'success'
      ? runOfflineQueueSuccess({ invoiceId: ID, tenantId: A, fromOfflineQueue: true, offlineQueueId: ID, environment: 'test', ksefNumber: 'test' }, ctx)
      : runOfflineQueueFailure({ invoiceId: ID, tenantId: A, fromOfflineQueue: true, offlineQueueId: ID, environment: 'test', error: 'test' }, ctx)).rejects.toThrow('nie należy');
    expect(writes()).toEqual([]);
  });
  it('scopes a valid success callback instead of completing a second tenant queue row', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'accepted', ksef_environment: 'test' }];
    tables.ksef_offline_queue = [
      { id: ID, tenant_id: A, invoice_id: ID, status: 'sending', ksef_environment: 'test' },
      { id: OTHER, tenant_id: B, invoice_id: ID, status: 'sending', ksef_environment: 'test' },
    ];
    await runOfflineQueueSuccess({ invoiceId: ID, tenantId: A, fromOfflineQueue: true, offlineQueueId: ID, environment: 'test', ksefNumber: 'test' }, ctx);
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
  it('does not rewrite an incoming draft when its submit job fails', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, direction: 'incoming', ksef_status: 'draft',
      invoice_kind: 'regular', submitted_to_ksef_at: null }];
    await expect(onSubmitInvoiceExhausted(new Error('manual reconciliation'), submitEvent, ctx))
      .resolves.toMatchObject({ handled: false, reason: 'invoice-direction-mismatch' });
    expect(tables.invoices[0].ksef_status).toBe('draft');
    expect(writes()).toEqual([]);
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('rejects an incoming draft with a matching event document before KSeF I/O', async () => {
    const invoice = { type: 'VAT', internalNumber: 'TEST-1' } as Invoice;
    tables.invoices = [{ id: ID, tenant_id: A, direction: 'incoming', ksef_status: 'draft',
      invoice_kind: 'regular', invoice_type: 'VAT', internal_number: 'TEST-1',
      fa3_data: invoice, submitted_to_ksef_at: null, submission_attempts: 0 }];
    await expect(runSubmitInvoice({ ...submitEvent, invoice }, ctx)).rejects.toThrow('manual reconciliation');
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
  it.each(['correction', 'advance', 'final'])('does not send an incomplete %s event as ordinary VAT', async (invoiceKind) => {
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'draft', invoice_kind: invoiceKind,
      internal_number: 'TEST-1', parent_invoice_id: OTHER, advance_invoice_ids: [OTHER],
    }];
    await expect(runSubmitInvoice(submitEvent, ctx)).rejects.toThrow('manual reconciliation');
    expect(writes()).toEqual([]);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.health).not.toHaveBeenCalled();
  });
  it('retries an advance on KSeF outage without claiming Offline24 success', async () => {
    const seller = {
      // Clearly fictitious, while satisfying the local checksum-only fixture guard.
      nip: '0000000000', name: 'Test seller',
      address: { countryCode: 'PL', addressLine1: 'Testowa 1', addressLine2: '00-000 Test' },
    };
    const taxAnnotations = { cashMethod: 2, splitPayment: 2 } as const;
    const sellerParty = JSON.parse(JSON.stringify(sellerPartyFromSellerData(seller)));
    const advanceData = {
      invoiceType: 'advance', internalNumber: 'TEST-1', seller, taxAnnotations,
      paymentMethod: 'transfer', paymentDueDate: '2026-09-28', bankAccount: '11111111111111111111111111',
    } as AdvanceInvoiceData;
    const advanceInvoice = {
      type: 'ZAL', internalNumber: 'TEST-1', seller: sellerParty,
      payment: { method: 'transfer', dueDate: '2026-09-28', bankAccount: '11111111111111111111111111' },
      annotations: taxAnnotations, advanceEnvelope: advanceData,
    } as Invoice;
    tables.tenants = [{ id: A, nip: seller.nip, name: seller.name, address_json: seller.address }];
    tables.invoices = [{
      id: ID, tenant_id: A, direction: 'outgoing', ksef_status: 'draft', invoice_kind: 'advance',
      invoice_type: 'ZAL', internal_number: 'TEST-1', advance_invoice_ids: [],
      seller_nip: seller.nip, seller_data: sellerParty, fa3_data: advanceInvoice,
    }];
    mocks.health.mockResolvedValue({ offline: true, reason: 'KSeF down', isMfOutage: true });
    const specialEvent = {
      ...submitEvent,
      nip: seller.nip,
      invoice: advanceInvoice,
      advanceData,
    };
    await expect(runSubmitInvoice(specialEvent, ctx)).rejects.toThrow('automatic Offline24 is paused');
    expect(mocks.offlineAdd).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
  it('retries an ordinary PROD submit outage without creating an Offline24 document', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    const regularInvoice = { type: 'VAT', internalNumber: 'TEST-1' } as Invoice;
    tables.invoices = [{
      id: ID, tenant_id: A, direction: 'outgoing', ksef_status: 'draft', invoice_kind: 'regular',
      invoice_type: 'VAT', internal_number: 'TEST-1', fa3_data: regularInvoice,
    }];
    mocks.health.mockResolvedValue({ offline: true, reason: 'KSeF down', isMfOutage: true });
    await expect(runSubmitInvoice({
      ...submitEvent, environment: 'production', invoice: regularInvoice,
    }, ctx)).rejects.toThrow('automatic Offline24 is paused');
    expect(mocks.offlineAdd).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
  it('rejects a stale event whose legal document differs from stored fa3_data before KSeF I/O', async () => {
    const staleInvoice = {
      type: 'VAT', internalNumber: 'TEST-1', buyer: { name: 'Before edit' },
    } as Invoice;
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'draft', invoice_kind: 'regular',
      invoice_type: 'VAT', internal_number: 'TEST-1',
      fa3_data: { type: 'VAT', internalNumber: 'TEST-1', buyer: { name: 'After edit' } },
    }];
    await expect(runSubmitInvoice({ ...submitEvent, invoice: staleInvoice }, ctx))
      .rejects.toThrow('manual reconciliation');
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.offlineAdd).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
  it('rejects a replayed PROD Offline24 submit before privileged DB access', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    await expect(runSubmitInvoice({
      ...submitEvent, environment: 'production',
      fromOfflineQueue: true, offlineQueueId: OTHER,
    }, ctx)).rejects.toThrow('Legacy PROD Offline24 QR requires manual reconciliation');
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
  it('leaves a claimed PROD submit pending for reconciliation without Offline24', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'sending', invoice_kind: 'regular' }];
    const result = await onSubmitInvoiceExhausted(new Error('timeout'), {
      ...submitEvent, environment: 'production',
    }, ctx);
    expect(result).toMatchObject({ handled: false, reason: 'sending-reconciliation' });
    expect(tables.invoices[0].ksef_status).toBe('sending');
    expect(mocks.offlineAdd).not.toHaveBeenCalled();
  });
  it('never parks a possibly sent TEST invoice in Offline24 after exhaustion', async () => {
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'sending', invoice_kind: 'regular',
      submitted_to_ksef_at: '2026-09-27T10:00:00.000Z',
    }];
    const result = await onSubmitInvoiceExhausted(new Error('ECONNRESET'), submitEvent, ctx);
    expect(result).toMatchObject({ handled: false, reason: 'sending-reconciliation' });
    expect(tables.invoices[0].ksef_status).toBe('sending');
    expect(mocks.offlineAdd).not.toHaveBeenCalled();
  });
  it('keeps a previously recorded 440 when a stale callback later fails', async () => {
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'failed', invoice_kind: 'regular',
      submitted_to_ksef_at: '2026-09-27T10:00:00.000Z',
      last_error_code: 'KSEF_DUPLICATE_440',
      last_error: 'KSeF ma już fakturę o tym numerze — numer KSeF TEST.',
    }];
    const result = await onSubmitInvoiceExhausted(new Error('manual reconciliation'), submitEvent, ctx);
    expect(result).toMatchObject({ handled: false, reason: 'duplicate-reconciliation' });
    expect(tables.invoices[0].last_error_code).toBe('KSEF_DUPLICATE_440');
    expect(writes()).toEqual([]);
  });
  it('does not let an old 440 callback overwrite a newer sending claim', async () => {
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'sending', invoice_kind: 'regular',
      submitted_to_ksef_at: '2026-09-27T10:00:00.000Z', last_error_code: null,
    }];
    expect(await onSubmitInvoiceExhausted(
      new Error('KSEF_DUPLICATE_440: KSeF ma już fakturę o tym numerze.'), submitEvent, ctx,
    )).toMatchObject({ handled: false, reason: 'duplicate-reconciliation' });
    expect(tables.invoices[0]).toMatchObject({ ksef_status: 'sending', last_error_code: null });
    expect(writes()).toEqual([]);
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('cannot clear a 440 marker from a terminal row after reading it without one', async () => {
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'failed', invoice_kind: 'regular',
      submitted_to_ksef_at: null, last_error_code: null,
    }];
    expect(await onSubmitInvoiceExhausted(new Error('older timeout'), submitEvent, ctx))
      .toMatchObject({ handled: false, reason: 'historical-reconciliation' });
    expect(writes()).toEqual([]);
    await onSubmitInvoiceExhausted(new Error('KSEF_DUPLICATE_440: KSeF ma już fakturę o tym numerze.'), submitEvent, ctx);
    expect(tables.invoices[0].last_error_code).toBe('KSEF_DUPLICATE_440');
    await onSubmitInvoiceExhausted(new Error('older timeout'), submitEvent, ctx);
    expect(tables.invoices[0].last_error_code).toBe('KSEF_DUPLICATE_440');
  });
  it('rejects a historical TEST Offline24 submit before KSeF I/O even with a queued invoice', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'offline_queued', submitted_to_ksef_at: null }];
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'sending', ksef_environment: 'test',
    }];
    await expect(runSubmitInvoice({
      ...submitEvent, fromOfflineQueue: true, offlineQueueId: OTHER,
    }, ctx)).rejects.toThrow('Offline24 automatic replay requires manual reconciliation');
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
  it('does not let a stale failure callback replace a concurrent KSeF acceptance', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'queued', invoice_kind: 'regular',
      submitted_to_ksef_at: null,
    }];
    const racingContext: JobContext = {
      ...ctx,
      step: {
        ...ctx.step,
        run: async <T,>(name: string, fn: () => Promise<T> | T): Promise<T> => {
          if (name === 'mark-as-final') {
            tables.invoices[0].ksef_status = 'accepted';
            tables.invoices[0].ksef_number = 'TEST-KSEF-NUMBER';
          }
          return fn();
        },
      },
    };
    const result = await onSubmitInvoiceExhausted(new Error('timeout'), {
      ...submitEvent, environment: 'production',
    }, racingContext);
    expect(result).toMatchObject({ handled: false, reason: 'status-changed' });
    expect(tables.invoices[0]).toMatchObject({
      ksef_status: 'accepted', ksef_number: 'TEST-KSEF-NUMBER',
    });
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('does not park a special document after retry exhaustion', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'sending', invoice_kind: 'advance' }];
    const result = await onSubmitInvoiceExhausted(new Error('timeout'), submitEvent, ctx);
    expect(result).toMatchObject({ handled: false, reason: 'sending-reconciliation' });
    expect(tables.invoices[0].ksef_status).toBe('sending');
    expect(mocks.offlineAdd).not.toHaveBeenCalled();
  });
  it('recovers missing UPO after a pg-boss restart on an accepted invoice without another POST', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'accepted', ksef_number: 'TEST', ksef_environment: 'test' }];
    await expect(runSubmitInvoice(submitEvent, ctx)).resolves.toEqual({ alreadyAccepted: true, ksefNumber: 'TEST' });
    expect(writes()).toEqual([]); expect(mocks.submit).not.toHaveBeenCalled();
    expect(sendEvent).toHaveBeenCalledWith('recover-upo-after-accepted', expect.objectContaining({
      name: 'invoice/upo.requested',
      data: expect.objectContaining({ invoiceId: ID, tenantId: A, ksefNumber: 'TEST' }),
    }));
  });
  it('does not request UPO or POST for an accepted incoming invoice on a replayed submit event', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, direction: 'incoming', ksef_status: 'accepted',
      ksef_number: 'TEST', ksef_environment: 'test' }];
    await expect(runSubmitInvoice(submitEvent, ctx)).rejects.toThrow('incoming invoice');
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
  it('does not duplicate a present UPO record on an accepted replay', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'accepted', ksef_number: 'TEST', ksef_environment: 'test' }];
    tables.upo_receipts = [{ id: OTHER, tenant_id: A, invoice_id: ID, ksef_number: 'TEST' }];
    await expect(runSubmitInvoice(submitEvent, ctx)).resolves.toEqual({ alreadyAccepted: true, ksefNumber: 'TEST' });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('does not POST to KSeF after a prior sending step when a worker restarts', async () => {
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'sending', invoice_kind: 'regular',
      submitted_to_ksef_at: '2026-09-27T10:00:00.000Z',
    }];
    await expect(runSubmitInvoice(submitEvent, ctx)).rejects.toThrow('manual reconciliation');
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
  it.each([null, 'demo'] as const)('keeps accepted invoice with stored environment %s for reconciliation', async (storedEnvironment) => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'accepted', ksef_number: 'HISTORICAL', ksef_environment: storedEnvironment }];
    await expect(runSubmitInvoice(submitEvent, ctx)).rejects.toThrow('manual reconciliation');
    await expect(onSubmitInvoiceExhausted(new Error('manual reconciliation'), submitEvent, ctx))
      .resolves.toMatchObject({ handled: false, reason: 'accepted-reconciliation' });
    expect(tables.invoices[0].ksef_status).toBe('accepted');
    expect(writes()).toEqual([]);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('rejects a submit event without environment before DB or KSeF I/O', async () => {
    const legacy = { ...submitEvent, environment: undefined } as unknown as typeof submitEvent;
    await expect(runSubmitInvoice(legacy, ctx)).rejects.toThrow('Niepoprawny payload');
    expect(calls).toEqual([]);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('requires accepted invoice in current environment before a success callback', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'sending', ksef_environment: 'test' }];
    tables.ksef_offline_queue = [{ id: ID, tenant_id: A, invoice_id: ID, status: 'sending', ksef_environment: 'test' }];
    await expect(runOfflineQueueSuccess({ invoiceId: ID, tenantId: A, fromOfflineQueue: true, offlineQueueId: ID, environment: 'test', ksefNumber: 'test' }, ctx))
      .rejects.toThrow('without accepted invoice');
    expect(tables.ksef_offline_queue[0].status).toBe('sending');
  });
  it('quarantines a stale Offline24 failure after invoice acceptance', async () => {
    tables.invoices = [{ id: ID, tenant_id: A, ksef_status: 'accepted', ksef_environment: 'test' }];
    tables.ksef_offline_queue = [{ id: ID, tenant_id: A, invoice_id: ID, status: 'sending', ksef_environment: 'test' }];
    await expect(runOfflineQueueFailure({ invoiceId: ID, tenantId: A, fromOfflineQueue: true, offlineQueueId: ID, environment: 'test', error: 'old failure' }, ctx))
      .rejects.toThrow('accepted invoice requires reconciliation');
    expect(tables.invoices[0].ksef_status).toBe('accepted');
    expect(tables.ksef_offline_queue[0].status).toBe('failed');
  });
  it('does not requeue an invoice accepted after the Offline24 failure read', async () => {
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'failed', ksef_environment: 'test',
      invoice_kind: 'regular', invoice_type: 'VAT', fa3_data: { type: 'VAT' },
      submitted_to_ksef_at: null,
    }];
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'sending', ksef_environment: 'test', attempts: 1,
    }];
    const racingContext: JobContext = {
      ...ctx,
      step: {
        ...ctx.step,
        run: async <T,>(name: string, fn: () => Promise<T> | T): Promise<T> => {
          if (name === 'rollback-queue-status') {
            tables.invoices[0].ksef_status = 'accepted';
            tables.invoices[0].ksef_number = 'TEST-KSEF-NUMBER';
          }
          return fn();
        },
      },
    };
    expect(await runOfflineQueueFailure({
      invoiceId: ID, tenantId: A, fromOfflineQueue: true, offlineQueueId: OTHER,
      environment: 'test', error: 'old failure', terminal: false,
    }, racingContext)).toMatchObject({ success: false, reason: 'manual-reconciliation' });
    expect(tables.invoices[0]).toMatchObject({
      ksef_status: 'accepted', ksef_number: 'TEST-KSEF-NUMBER',
    });
    expect(tables.ksef_offline_queue[0].status).toBe('failed');
  });
  it('quarantines a legacy nonterminal Offline24 callback for failed invoice without a timestamp', async () => {
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'failed', submitted_to_ksef_at: null,
      invoice_kind: 'regular', invoice_type: 'VAT', fa3_data: { type: 'VAT' },
    }];
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'sending', ksef_environment: 'test', attempts: 1,
    }];
    expect(await runOfflineQueueFailure({
      invoiceId: ID, tenantId: A, fromOfflineQueue: true, offlineQueueId: OTHER,
      environment: 'test', error: 'old timeout', terminal: false,
    }, ctx)).toMatchObject({ success: false, reason: 'manual-reconciliation' });
    expect(tables.invoices[0].ksef_status).toBe('failed');
    expect(tables.ksef_offline_queue[0].status).toBe('failed');
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it('quarantines a historical regular PROD Offline24 failure instead of requeueing it', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: 'offline_queued', invoice_kind: 'regular',
      invoice_type: 'VAT', fa3_data: { type: 'VAT' },
    }];
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'sending', ksef_environment: 'production',
    }];
    const result = await runOfflineQueueFailure({
      invoiceId: ID, tenantId: A, fromOfflineQueue: true,
      offlineQueueId: OTHER, environment: 'production', error: 'old event',
    }, ctx);
    expect(result).toMatchObject({ success: false, reason: 'special-reconciliation' });
    expect(tables.invoices[0]).toMatchObject({
      ksef_status: 'failed', last_error_code: 'OFFLINE_PROD_QR_UNVERIFIED',
    });
    expect(tables.ksef_offline_queue[0].status).toBe('failed');
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it.each(['failed', 'offline_queued'])(
    'does not requeue a historical special document with invoice status %s', async (status) => {
    tables.invoices = [{
      id: ID, tenant_id: A, ksef_status: status, invoice_kind: 'advance',
      invoice_type: 'ZAL', fa3_data: { type: 'ZAL' },
    }];
    tables.ksef_offline_queue = [{
      id: OTHER, tenant_id: A, invoice_id: ID, status: 'sending', ksef_environment: 'test',
    }];
    const result = await runOfflineQueueFailure({
      invoiceId: ID, tenantId: A, fromOfflineQueue: true,
      offlineQueueId: OTHER, environment: 'test', error: 'old event',
    }, ctx);
    expect(result).toMatchObject({ success: false, reason: 'special-reconciliation' });
    expect(tables.ksef_offline_queue[0].status).toBe('failed');
    expect(tables.invoices[0].ksef_status).toBe('failed');
    },
  );
  it('invoice read/write helpers require tenant and never affect a foreign row', async () => {
    tables.invoices = [{ id: ID, tenant_id: B, fa3_data: { internalNumber: 'PRIVATE' }, ksef_status: 'accepted' }];
    await expect(getInvoiceForSubmit(ID, A)).rejects.toThrow('no fa3_data');
    await expect(updateInvoiceStatus(ID, { ksef_status: 'failed' }, A)).rejects.toThrow('Nie udało się zaktualizować');
    expect(tables.invoices[0].ksef_status).toBe('accepted');
    await expect(updateInvoiceStatus(ID, { ksef_status: 'failed' }, '')).rejects.toThrow('Brak organizacji');
    expect(calls.filter((q) => q.table === 'invoices').every((q) => q.filters.some(([k,v]) => k === 'tenant_id' && v === A))).toBe(true);
  });
});
