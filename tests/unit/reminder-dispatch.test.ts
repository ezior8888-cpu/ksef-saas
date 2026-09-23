import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NonRetriableError } from 'inngest';
import type { FloApprovalRow, FloProposalRow } from '@/lib/flo/db-types';
import type { FloApproveInput } from '@/types/flo';
import type { ReminderDelivery, ReminderInvoiceSource } from '@/types/reminder-delivery';
import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;
type Query = { table: string; action: 'select' | 'update'; filters: Array<[string, unknown]>; patch?: Row };
const mocks = vi.hoisted(() => ({ db: vi.fn(), send: vi.fn(), upload: vi.fn(), kind: vi.fn(), tenantKind: vi.fn(), globalFlag: vi.fn() }));
vi.mock('@/lib/flo/db-types', () => ({ floDb: mocks.db }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.db }));
vi.mock('@/lib/flo/flags', () => ({ isKindEnabled: mocks.kind }));
vi.mock('@/lib/flo/kind-switch', () => ({ isKindEnabledForTenant: mocks.tenantKind }));
vi.mock('@/lib/feature-flags/global-flags', () => ({ getGlobalFlagForExecution: mocks.globalFlag }));
vi.mock('@/lib/storage/r2', () => ({ uploadToR2: mocks.upload }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
import { authorizeReminderDispatch, readReminderDispatch, assertDeliveryDeadline } from '@/lib/reminders/delivery-consent';
import { runSendReminder } from '@/lib/inngest/jobs/send-reminder';
import { assertReminderSendable } from '@/lib/reminders/delivery-safety';
import { approvalOperationHash, proposalApprovalVersion } from '@/lib/flo/approval-version';
import { reminderInvoiceFingerprint } from '@/lib/reminders/delivery-schema';
import { DISCLAIMER } from '@/lib/flo/functions/payment-chase';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INVOICE = '11111111-1111-4111-8111-111111111111';
const PROPOSAL = '22222222-2222-4222-8222-222222222222';
const APPROVAL = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-09-23T12:00:00.000Z');
const CREATED = '2026-09-23T11:59:00.000Z';
const EXPIRES = '2026-09-23T12:20:00.000Z';
const pdf = Buffer.from('%PDF-1.7\nsynthetic approved demand letter bytes\n%%EOF');
const jobData = { reminderId: APPROVAL, approvalId: APPROVAL };
let tables: Record<string, Row[]>;
let calls: Query[];
let fail: ((query: Query) => boolean) | undefined;
function field(row: Row, key: string): unknown {
  const parts = key.replaceAll('->>', '->').split('->');
  let value: unknown = row;
  for (const part of parts) value = value && typeof value === 'object' ? (value as Row)[part] : undefined;
  return key.includes('->>') ? (value === undefined || value === null ? null : String(value)) : value;
}
function db() {
  return { from(table: string) {
    const q: Query = { table, action: 'select', filters: [] }; calls.push(q);
    const filters: Array<(row: Row) => boolean> = [];
    let one = false;
    let limit = Infinity;
    let order: string | undefined;
    const execute = () => {
      if (fail?.(q)) return { data: null, error: { message: 'PRIVATE-DATABASE-DIAGNOSTIC' } };
      let rows = (tables[table] ?? []).filter((row) => filters.every((check) => check(row)));
      if (order) rows = rows.toSorted((a, b) => String(b[order!]).localeCompare(String(a[order!])));
      rows = rows.slice(0, limit);
      if (q.action === 'update') rows.forEach((row) => Object.assign(row, structuredClone(q.patch)));
      return { data: structuredClone(one ? rows[0] ?? null : rows), error: null };
    };
    const builder = {
      select: () => builder,
      update: (patch: Row) => { q.action = 'update'; q.patch = patch; return builder; },
      eq: (key: string, value: unknown) => { q.filters.push([key, value]); filters.push((r) => field(r, key) === value); return builder; },
      is: (key: string, value: unknown) => { q.filters.push([key, value]); filters.push((r) => field(r, key) === value); return builder; },
      in: (key: string, values: unknown[]) => { q.filters.push([key, values]); filters.push((r) => values.includes(field(r, key))); return builder; },
      gt: (key: string, value: string) => { filters.push((r) => String(field(r, key)) > value); return builder; },
      order: (key: string) => { order = key; return builder; },
      limit: (value: number) => { limit = value; return builder; },
      maybeSingle: () => { one = true; return Promise.resolve(execute()); },
      single: () => { one = true; return Promise.resolve(execute()); },
      then: <T = ReturnType<typeof execute>, E = never>(resolve?: ((v: ReturnType<typeof execute>) => T | PromiseLike<T>) | null,
        reject?: ((e: unknown) => E | PromiseLike<E>) | null) => Promise.resolve(execute()).then(resolve, reject),
    };
    return builder;
  } };
}
const context: JobContext = { attempt: 0, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_name, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() } };
function durableContext(): JobContext {
  const cache = new Map<string, unknown>();
  return { ...context, step: { ...context.step, run: async <T>(name: string, fn: () => T | Promise<T>): Promise<T> => {
    if (cache.has(name)) return structuredClone(cache.get(name)) as T;
    const value = await fn(); cache.set(name, structuredClone(value)); return value;
  } } };
}
function invoice(): ReminderInvoiceSource {
  return { id: INVOICE, tenant_id: TENANT, gross_total: 123, paid_amount: 0, currency: 'PLN',
    payment_status: 'unpaid', direction: 'issued', ksef_status: 'accepted', payment_due_date: '2026-09-01',
    issue_date: '2026-08-01', internal_number: 'TEST-1', ksef_number: 'TEST-KSEF',
    buyer_data: { name: 'Buyer test', email: 'buyer@example.test' }, buyer_nip: '1234567890',
    payment_data: { bankAccount: 'TEST-ACCOUNT' }, seller_data: { name: 'Seller test' }, reminders_paused: false };
}
function delivery(attachment = false): ReminderDelivery {
  return { version: 1, tenantId: TENANT, invoiceId: INVOICE, stage: attachment ? 'stage_3' : 'stage_1',
    preparedAt: CREATED, expiresAt: EXPIRES, sourceFingerprint: reminderInvoiceFingerprint(invoice()),
    from: 'Seller <seller@example.test>', to: 'buyer@example.test', replyTo: 'reply@example.test',
    subject: 'Approved subject TEST-1', text: 'Approved plain text.\n' + DISCLAIMER,
    attachment: attachment ? { filename: 'Approved-TEST-1.pdf', contentBase64: pdf.toString('base64') } : null,
    daysOverdue: 22 };
}
async function seed(options: { attachment?: boolean; input?: FloApproveInput; authorize?: boolean } = {}) {
  const source = delivery(options.attachment);
  const proposal: FloProposalRow = { id: PROPOSAL, tenant_id: TENANT, kind: 'payment.chase', topic_key: 'reminder-preview:' + PROPOSAL,
    status: 'executing', priority: 10, title: 'Approved reminder', body: source.text,
    payload: { invoiceId: INVOICE, stage: source.stage, delivery: source, preparedBy: USER }, evidence: [], fingerprint: 'invoice-facts',
    expires_at: EXPIRES, created_at: CREATED, approved_at: NOW.toISOString(), approved_by: USER,
    executed_at: null, dismissed_reason: null };
  const version = proposalApprovalVersion(proposal);
  const approval: FloApprovalRow = { id: APPROVAL, proposal_id: PROPOSAL, tenant_id: TENANT, user_id: USER,
    created_at: CREATED, consumed_at: NOW.toISOString(), expires_at: EXPIRES,
    snapshot: { approvalVersion: 1, proposalVersion: version, operationHash: approvalOperationHash(version, options.input),
      input: options.input ?? null, payload: structuredClone(proposal.payload) } };
  tables.flo_proposals = [{ ...proposal }]; tables.flo_approvals = [{ ...approval }];
  tables.invoices = [{ ...invoice() }]; tables.payments = []; tables.contractors = [];
  tables.memberships = [{ user_id: USER, organization_id: TENANT, status: 'active' }];
  tables.payment_reminders = [{ id: APPROVAL, tenant_id: TENANT, invoice_id: INVOICE, stage: source.stage, channel: 'email', status: 'pending' }];
  if (options.authorize !== false) await authorizeReminderDispatch({ proposal, userId: USER, approvalId: APPROVAL, snapshot: approval.snapshot, input: options.input });
  calls = [];
  return { proposal, approval, delivery: source };
}
function snapshot(): Row { return tables.flo_approvals[0].snapshot as Row; }
function expectNoSend() { expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled(); }
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv('RESEND_API_KEY', 're_synthetic_test_key');
  tables = {}; calls = []; fail = undefined;
  mocks.db.mockImplementation(db); mocks.kind.mockReturnValue(true);
  mocks.tenantKind.mockResolvedValue({ enabled: true }); mocks.globalFlag.mockResolvedValue(false);
  mocks.send.mockResolvedValue({ data: { id: 'mail-accepted-test' }, error: null }); mocks.upload.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('reminder consent registry with the real helper', () => {
  it('rejects an arbitrary UUID instead of treating its existence in the event as consent', async () => {
    tables.flo_approvals = []; await expect(runSendReminder(jobData, context)).rejects.toThrow('zgody'); expectNoSend();
  });
  it.each([{ reminderId: APPROVAL, approvalId: 'legacy-token' }, { reminderId: 'legacy-id', approvalId: APPROVAL },
    { reminderId: PROPOSAL, approvalId: APPROVAL }])('rejects legacy/mismatched event identities before any privileged reads: %j', async (event) => {
    await expect(runSendReminder(event, context)).rejects.toThrow('zgody'); expect(mocks.db).not.toHaveBeenCalled(); expectNoSend();
  });
  it('does not accept a retired consumed token that was never authorized for dispatch', async () => {
    await seed({ authorize: false }); await expect(readReminderDispatch(APPROVAL)).rejects.toThrow();
    await expect(runSendReminder(jobData, context)).rejects.toThrow('zgody'); expectNoSend();
  });
  it('rejects a superseded proposal version even if the original token and marker are present', async () => {
    await seed(); tables.flo_proposals[0].body = 'Different content';
    await expect(runSendReminder(jobData, context)).rejects.toThrow('zgody'); expectNoSend();
  });
  it('rejects a marker copied from a different approval', async () => {
    await seed(); (snapshot().reminderDispatch as Row).reminderId = PROPOSAL;
    await expect(runSendReminder(jobData, context)).rejects.toThrow('zgody'); expectNoSend();
  });
  it('rejects an approval owned by another tenant or actor', async () => {
    await seed(); tables.flo_approvals[0].tenant_id = FOREIGN;
    await expect(runSendReminder(jobData, context)).rejects.toThrow('zgody'); expectNoSend();
  });
  it('refuses to authorize a replaced operation input', async () => {
    const { proposal, approval } = await seed({ authorize: false });
    await expect(authorizeReminderDispatch({ proposal, userId: USER, approvalId: APPROVAL,
      snapshot: approval.snapshot, input: { editedBody: 'Different message. ' + DISCLAIMER } })).rejects.toThrow();
    expect(snapshot().reminderDispatch).toBeUndefined(); expectNoSend();
  });
  it('sends exactly the approved edited body and escapes markup for HTML', async () => {
    const text = '<img src=x onerror=bad> Edited message.\n' + DISCLAIMER;
    await seed({ input: { editedBody: text } });
    await runSendReminder(jobData, context);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ text, html: expect.stringContaining('&lt;img') }), expect.anything());
    expect(mocks.send.mock.calls[0][0].html).not.toContain('<img');
  });
});

describe('delayed reminder dispatch guards', () => {
  it.each(['flo_approvals', 'memberships', 'invoices', 'payments', 'contractors'])('retries an unavailable %s query within the original deadline without sending prematurely', async (table) => {
    await seed({ attachment: true }); fail = (q) => q.table === table && q.action === 'select';
    const result: unknown = await runSendReminder(jobData, context).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(Error); expect(result).not.toBeInstanceOf(NonRetriableError);
    expect(String(result)).not.toContain('PRIVATE-DATABASE-DIAGNOSTIC'); expectNoSend();
    expect(snapshot().reminderReceipt).toBeUndefined();
    fail = undefined; vi.setSystemTime(new Date('2026-09-23T12:01:00.000Z'));
    await expect(runSendReminder(jobData, context)).resolves.toMatchObject({ success: true });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1]).toEqual({ idempotencyKey: 'reminder/' + APPROVAL });
  });
  it('treats a confirmed changed invoice as a permanent denial rather than a retryable outage', async () => {
    await seed(); tables.invoices[0].reminders_paused = true;
    await expect(runSendReminder(jobData, context)).rejects.toBeInstanceOf(NonRetriableError); expectNoSend();
  });
  it('normalizes the column NIP and refuses conflicting invoice identities', async () => {
    await seed();
    const source = { ...invoice(), buyer_nip: '123-456-78-90', buyer_data: { name: 'Buyer', nip: '1234567890', email: 'buyer@example.test' } };
    tables.invoices = [{ ...source }];
    tables.contractors = [{ tenant_id: TENANT, nip: '1234567890', reminder_excluded: true }];
    await expect(assertReminderSendable({ ...delivery(), sourceFingerprint: reminderInvoiceFingerprint(source) })).rejects.toThrow();
    tables.contractors = []; source.buyer_data.nip = '9999999999'; tables.invoices = [{ ...source }];
    await expect(assertReminderSendable({ ...delivery(), sourceFingerprint: reminderInvoiceFingerprint(source) })).rejects.toThrow();
    expectNoSend();
  });

  it('honors contractor exclusion when the invoice stores its NIP only inside buyer_data', async () => {
    await seed();
    const source = { ...invoice(), buyer_nip: null, buyer_data: { name: 'Buyer', nip: '1234567890', email: 'buyer@example.test' } };
    tables.invoices = [{ ...source }];
    tables.contractors = [{ tenant_id: TENANT, nip: '1234567890', reminder_excluded: true }];
    const approved = { ...delivery(), sourceFingerprint: reminderInvoiceFingerprint(source) };
    await expect(assertReminderSendable(approved)).rejects.toThrow(); expectNoSend();
  });

  it.each([{ tenant_id: FOREIGN }, { invoice_id: PROPOSAL }, { stage: 'stage_2' }, { channel: 'sms' }])('rejects a changed reminder relation before transport: %j', async (patch) => {
    await seed(); Object.assign(tables.payment_reminders[0], patch);
    await expect(runSendReminder(jobData, context)).rejects.toThrow('Przypomnienie'); expectNoSend();
  });
  it.each([{ paid_amount: 123, payment_status: 'paid' }, { paid_amount: 10 }, { reminders_paused: true }, { tenant_id: FOREIGN },
    { buyer_data: { email: 'changed@example.test' } }, { payment_data: { bankAccount: 'CHANGED' } }])('fresh invoice changes invalidate a delayed send: %j', async (patch) => {
    await seed(); Object.assign(tables.invoices[0], patch);
    await expect(runSendReminder(jobData, context)).rejects.toThrow(); expectNoSend();
  });
  it('rechecks recent invoice payments and excluded contractors', async () => {
    await seed(); tables.payments = [{ tenant_id: TENANT, invoice_id: INVOICE, payment_date: '2026-09-23' }];
    await expect(runSendReminder(jobData, context)).rejects.toThrow(); expectNoSend();
    tables.payments = []; tables.contractors = [{ tenant_id: TENANT, nip: '1234567890', reminder_excluded: true }];
    await expect(runSendReminder(jobData, context)).rejects.toThrow(); expectNoSend();
  });
  it('rechecks approval actor membership', async () => {
    await seed(); tables.memberships[0].status = 'revoked';
    await expect(runSendReminder(jobData, context)).rejects.toThrow('dostępu'); expectNoSend();
  });
  it.each(['code', 'tenant', 'global'] as const)('respects a newly disabled %s switch', async (layer) => {
    await seed(); if (layer === 'code') mocks.kind.mockReturnValue(false); else if (layer === 'tenant') mocks.tenantKind.mockResolvedValue({ enabled: false }); else { mocks.globalFlag.mockResolvedValue(true); mocks.tenantKind.mockImplementation(async (_kind: string, _tenant: string, _db: unknown, readGlobalKill: () => Promise<boolean>) => ({ enabled: !(await readGlobalKill()) })); }
    await expect(runSendReminder(jobData, context)).rejects.toThrow('wstrzymana'); expectNoSend();
    if (layer === 'global') expect(mocks.globalFlag).toHaveBeenCalledWith('killFloAgent');
  });
  it('fails closed when fresh authorization storage cannot be read', async () => {
    await seed(); fail = (q) => q.table === 'memberships';
    await expect(runSendReminder(jobData, context)).rejects.toThrow(); expectNoSend();
  });
  it('rejects elapsed preview expiry and does not extend the window during retries', async () => {
    await seed(); vi.setSystemTime(new Date(EXPIRES));
    await expect(runSendReminder(jobData, context)).rejects.toThrow('Termin'); expectNoSend();
  });
  it.each([{ created_at: 'invalid' }, { consumed_at: '2099-01-01T00:00:00.000Z' }, { expires_at: 'invalid' }])('rejects invalid approval clocks: %j', async (patch) => {
    const { approval, delivery } = await seed();
    expect(() => assertDeliveryDeadline({ ...approval, ...patch }, delivery, NOW.getTime())).toThrow();
  });
  it('ignores changes to templates and sender/DEV configuration after approval', async () => {
    const { delivery } = await seed({ attachment: true });
    tables.reminder_templates = [{ email_subject: 'UNAPPROVED', email_body: 'UNAPPROVED' }];
    tables.reminder_settings = [{ sender_email: 'unapproved@example.test' }];
    vi.stubEnv('RESEND_FROM_EMAIL', 'unapproved@example.test'); vi.stubEnv('RESEND_DEV_TO_OVERRIDE', 'unapproved@example.test');
    await runSendReminder(jobData, context);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ from: delivery.from, to: delivery.to,
      subject: delivery.subject, replyTo: delivery.replyTo, text: delivery.text,
      attachments: [{ filename: delivery.attachment!.filename, content: pdf.toString('base64') }] }), { idempotencyKey: 'reminder/' + APPROVAL });
    expect(mocks.upload).toHaveBeenCalledWith('reminders/' + TENANT + '/' + APPROVAL + '.pdf', pdf, 'application/pdf');
    expect(calls.some((q) => q.table === 'reminder_templates' || q.table === 'reminder_settings')).toBe(false);
  });
});

describe('provider acknowledgement and bookkeeping retries', () => {
  it('reuses identical transport after provider acceptance when persisting the trusted receipt failed', async () => {
    await seed({ attachment: true });
    fail = (q) => q.table === 'flo_approvals' && q.action === 'update' && Boolean((q.patch?.snapshot as Row | undefined)?.reminderReceipt);
    await expect(runSendReminder(jobData, context)).rejects.toThrow('utrwalić');
    expect(snapshot().reminderReceipt).toBeUndefined(); expect(mocks.upload).not.toHaveBeenCalled();
    expect(tables.payment_reminders[0].status).toBe('pending');
    fail = undefined;
    await expect(runSendReminder(jobData, context)).resolves.toMatchObject({ success: true });
    expect(mocks.send).toHaveBeenCalledTimes(2); expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
    expect(snapshot().reminderReceipt).toMatchObject({ messageId: 'mail-accepted-test', reminderId: APPROVAL });
  });
  it('does not repeat an uncertain accepted send after the original deadline', async () => {
    await seed(); fail = (q) => q.table === 'flo_approvals' && q.action === 'update';
    await expect(runSendReminder(jobData, context)).rejects.toThrow('utrwalić');
    fail = undefined; vi.setSystemTime(new Date(EXPIRES));
    await expect(runSendReminder(jobData, context)).rejects.toThrow('Termin');
    expect(mocks.send).toHaveBeenCalledTimes(1); expect(tables.payment_reminders[0].status).toBe('pending');
  });
  it('retries archiving from the trusted receipt after expiry and revocation without another email', async () => {
    await seed({ attachment: true }); mocks.upload.mockRejectedValueOnce(new Error('synthetic archive outage'));
    await expect(runSendReminder(jobData, context)).rejects.toThrow('synthetic archive outage');
    expect(snapshot().reminderReceipt).toMatchObject({ messageId: 'mail-accepted-test' });
    vi.setSystemTime(new Date('2026-09-23T14:00:00.000Z')); tables.memberships = [];
    tables.flo_proposals[0].status = 'dismissed'; mocks.kind.mockReturnValue(false);
    await expect(runSendReminder(jobData, context)).resolves.toMatchObject({ success: true });
    expect(mocks.send).toHaveBeenCalledTimes(1); expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[1]).toEqual(mocks.upload.mock.calls[0]);
  });
  it('does not overwrite a reminder moved to another invoice during provider acceptance', async () => {
    await seed(); mocks.send.mockImplementation(async () => {
      tables.payment_reminders[0].invoice_id = PROPOSAL;
      return { data: { id: 'mail-accepted-test' }, error: null };
    });
    await expect(runSendReminder(jobData, context)).rejects.toThrow('zapisać');
    expect(tables.payment_reminders[0]).toMatchObject({ invoice_id: PROPOSAL, status: 'pending' });
    expect(snapshot().reminderReceipt).toMatchObject({ messageId: 'mail-accepted-test' });
    const write = calls.find((q) => q.table === 'payment_reminders' && q.action === 'update')!;
    for (const filter of [['id', APPROVAL], ['tenant_id', TENANT], ['invoice_id', INVOICE], ['stage', 'stage_1'], ['channel', 'email']]) expect(write.filters).toContainEqual(filter);
  });

  it.each([{ error: { message: 'synthetic provider failure' }, data: null }, { error: null, data: {} }])('does not record a delivery without an acknowledged provider ID: %j', async (response) => {
    await seed(); mocks.send.mockResolvedValue(response);
    await expect(runSendReminder(jobData, context)).rejects.toThrow('potwierdzić');
    expect(tables.payment_reminders[0].status).toBe('pending'); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('uses the same key and identical bytes after an ambiguous provider failure', async () => {
    await seed({ attachment: true });
    mocks.send.mockRejectedValueOnce(new Error('synthetic timeout')).mockResolvedValueOnce({ data: { id: 'mail-accepted-test' }, error: null });
    await expect(runSendReminder(jobData, context)).rejects.toThrow('synthetic timeout');
    await runSendReminder(jobData, context);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
  });
  it('finishes a cached successful send after expiry without another provider request', async () => {
    await seed({ attachment: true }); const durable = durableContext();
    fail = (q) => q.table === 'payment_reminders' && q.action === 'update';
    await expect(runSendReminder(jobData, durable)).rejects.toThrow('zapisać');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    fail = undefined; vi.setSystemTime(new Date('2026-09-23T14:00:00.000Z')); tables.memberships = [];
    await expect(runSendReminder(jobData, durable)).resolves.toMatchObject({ success: true });
    expect(mocks.send).toHaveBeenCalledTimes(1); expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(tables.payment_reminders[0]).toMatchObject({ status: 'sent', email_message_id: 'mail-accepted-test' });
  });
  it('uses the service-only acknowledgement for pg-boss bookkeeping retry after expiry', async () => {
    await seed({ attachment: true }); fail = (q) => q.table === 'payment_reminders' && q.action === 'update';
    await expect(runSendReminder(jobData, context)).rejects.toThrow('zapisać');
    fail = undefined; vi.setSystemTime(new Date('2026-09-23T14:00:00.000Z')); tables.memberships = [];
    await expect(runSendReminder(jobData, context)).resolves.toMatchObject({ success: true });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(tables.payment_reminders[0]).toMatchObject({ status: 'sent', email_message_id: 'mail-accepted-test' });
  });
  it('does not trust a forged user-writable sent status as the service-only acknowledgement', async () => {
    await seed(); tables.payment_reminders[0].status = 'sent'; tables.payment_reminders[0].email_message_id = 'FORGED';
    await expect(runSendReminder(jobData, context)).resolves.toMatchObject({ skipped: true }); expectNoSend();
  });
});
