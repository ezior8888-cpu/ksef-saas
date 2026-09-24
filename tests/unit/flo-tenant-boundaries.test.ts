import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FloProposalRow } from '@/lib/flo/db-types';
import type { ReminderDelivery, ReminderInvoiceSource } from '@/types/reminder-delivery';
import { reminderDeliverySchema, reminderInvoiceFingerprint } from '@/lib/reminders/delivery-schema';
import { DISCLAIMER } from '@/lib/flo/functions/payment-chase';
import { createFakeDb, type FakeDb } from './flo-fake-db';

const mock = vi.hoisted(() => ({
  client: null as unknown,
  kill: vi.fn(async () => false),
  send: vi.fn(async () => ({ ids: [] })),
  audit: vi.fn(async () => {}),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mock.client }));
vi.mock('@/lib/feature-flags/global-flags', () => ({
  getGlobalFlagForExecution: mock.kill,
  getGlobalFlag: mock.kill,
}));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mock.send }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mock.audit }));
import '@/lib/flo/functions/payment-confirm';
import '@/lib/flo/functions/payment-chase-handler';
import '@/lib/flo/functions/expense-review';
import { getFloHandler } from '@/lib/flo/handlers';
import { readState, fingerprintOf } from '@/lib/flo/fingerprint';
import { approvalOperationHash, proposalApprovalVersion } from '@/lib/flo/approval-version';
import { executeProposal } from '@/lib/flo/execute';
import { undoAction } from '@/lib/flo/undo';

const NOW = new Date('2026-09-16T12:00:00Z');
function proposal(overrides: Partial<FloProposalRow> = {}): FloProposalRow {
  return {
    id: 'proposal-a', tenant_id: 'tenant-a', kind: 'payment.confirm',
    topic_key: 'topic', status: 'open', priority: 20, title: 'Synthetic',
    body: 'Synthetic',
    // K-01 z pulsu: jedna faktura na kartę, kwoty z odczytu re-walidacji.
    payload: { invoiceId: 'invoice-a', number: 'FV/A', facts: { grossTotal: 100, paidAmount: 0 } },
    fingerprint: 'old', evidence: [], expires_at: '2026-09-17T00:00:00Z',
    created_at: NOW.toISOString(), approved_at: null, approved_by: null,
    executed_at: null, dismissed_reason: null, ...overrides,
  };
}
function context(row = proposal(), input?: { selectedIds?: string[]; value?: string }) {
  return { proposal: row, userId: 'user-a', approvalId: 'approval-a', snapshot: {}, input };
}
let db: FakeDb;
beforeEach(() => {
  db = createFakeDb({
    invoices: [
      { id: 'invoice-a', tenant_id: 'tenant-a', gross_total: 100, paid_amount: 0, reminders_paused: false },
      { id: 'invoice-b', tenant_id: 'tenant-b', gross_total: 100, paid_amount: 0, reminders_paused: false },
    ],
    expenses: [{ id: 'expense-b', tenant_id: 'tenant-b', kpir_column: 'col_13', is_reviewed: false }],
  });
  mock.client = db.client;
  mock.kill.mockReset().mockResolvedValue(false);
  mock.send.mockClear();
  mock.audit.mockClear();
});
/** A real, version-bound consumed consent; failures below must reach tenant/current-state checks. */
function chaseContext(foreignInvoice = false, missingNip = false) {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const invoiceId = '22222222-2222-4222-8222-222222222222';
  const approvalId = '33333333-3333-4333-8333-333333333333';
  const userId = '44444444-4444-4444-8444-444444444444';
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
  const invoice: ReminderInvoiceSource = {
    id: invoiceId, tenant_id: foreignInvoice ? '55555555-5555-4555-8555-555555555555' : tenantId,
    gross_total: 100, paid_amount: 0, currency: 'PLN', payment_status: 'unpaid',
    direction: 'issued', ksef_status: 'accepted', payment_due_date: '2026-09-01',
    issue_date: '2026-08-20', internal_number: 'FV/fixture', ksef_number: null,
    buyer_data: missingNip
      ? { name: 'Fixture buyer', email: 'buyer@example.test' }
      : { name: 'Fixture buyer', email: 'buyer@example.test', nip: '1234567890' },
    buyer_nip: missingNip ? null : '1234567890',
    payment_data: {}, seller_data: { name: 'Fixture seller' }, reminders_paused: false,
  };
  db.tables.invoices.push({ ...invoice });
  const delivery: ReminderDelivery = reminderDeliverySchema.parse({
    version: 1, tenantId, invoiceId, stage: 'stage_1', preparedAt: now.toISOString(), expiresAt,
    sourceFingerprint: reminderInvoiceFingerprint(invoice), from: 'Fixture seller <sender@example.test>',
    to: 'buyer@example.test', replyTo: null, subject: 'Fixture reminder', text: 'Fixture reminder. ' + DISCLAIMER,
    attachment: null, daysOverdue: 1,
  });
  const row = proposal({
    id: '66666666-6666-4666-8666-666666666666', tenant_id: tenantId, kind: 'payment.chase',
    status: 'executing', approved_by: userId, approved_at: now.toISOString(), expires_at: expiresAt,
    payload: { invoiceId, stage: 'stage_1', delivery, preparedBy: userId },
  });
  const version = proposalApprovalVersion(row);
  const snapshot = { approvalVersion: 1, proposalVersion: version, operationHash: approvalOperationHash(version) };
  db.tables.flo_proposals.push({ ...row });
  db.tables.flo_approvals.push({ id: approvalId, proposal_id: row.id, tenant_id: tenantId, user_id: userId,
    created_at: now.toISOString(), consumed_at: now.toISOString(), expires_at: expiresAt, snapshot });
  return { proposal: row, userId, approvalId, snapshot };
}

describe('FLO entity boundaries', () => {
  it.each(['invoice-b', 'missing'])('rejects selected ID %s outside the proposal even for one grosz', async (id) => {
    await expect(getFloHandler('payment.confirm')!(context(proposal(), { selectedIds: [id], value: '0.01' }))).rejects.toThrow();
    expect(db.tables.payments).toHaveLength(0);
  });
  it('rejects a foreign invoice even if a malformed server proposal contains it', async () => {
    const row = proposal({ payload: { invoiceId: 'invoice-b', facts: { grossTotal: 100, paidAmount: 0 } } });
    await expect(getFloHandler('payment.confirm')!(context(row, { value: '1' }))).rejects.toThrow('Nie można potwierdzić');
    expect(db.tables.payments).toHaveLength(0);
  });
  it.each(['0', '-1', 'Infinity', 'NaN', '0.001', '100.01', '1e2'])('rejects invalid or excessive amount %s', async (value) => {
    await expect(getFloHandler('payment.confirm')!(context(proposal(), { value }))).rejects.toThrow();
    expect(db.tables.payments).toHaveLength(0);
  });
  it('checks current balance rather than trusting a stale proposal', async () => {
    db.tables.invoices[0]!.paid_amount = 99;
    await expect(getFloHandler('payment.confirm')!(context(proposal(), { value: '2' }))).rejects.toThrow('aktualnej należności');
    expect(db.tables.payments).toHaveLength(0);
  });
  it('writes an owned partial payment using actual schema and without fictitious invoice undo', async () => {
    const result = await getFloHandler('payment.confirm')!(context(proposal(), { value: '1,25' }));
    expect(db.tables.payments[0]).toMatchObject({ tenant_id: 'tenant-a', invoice_id: 'invoice-a', amount: 1.25, is_confirmed: true, match_method: 'flo_confirmation' });
    expect(db.tables.payments[0]!.payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(db.tables.payments[0]).not.toHaveProperty('paid_at');
    expect(result.details).not.toHaveProperty('undo');
    // Cofnięcie usuwa TĘ wpłatę (trigger przelicza fakturę), a nie przywraca
    // `invoices.paid_amount`.
    expect(result.undo).toMatchObject({ table: 'payments', op: 'delete', before: {} });
  });
  it('rejects missing or nonpositive proposed balance', async () => {
    for (const outstanding of [undefined, 0, -1, NaN, Infinity]) {
      const row = proposal({ payload: { invoiceId: 'invoice-a', facts: { grossTotal: outstanding, paidAmount: 0 } } });
      await expect(getFloHandler('payment.confirm')!(context(row, { value: '0.01' }))).rejects.toThrow();
    }
    expect(db.tables.payments).toHaveLength(0);
  });
  it('fingerprint reads cannot inspect invoices or expenses belonging to another tenant', async () => {
    expect(await readState('payment.chase', { invoiceId: 'invoice-b' }, 'tenant-a')).toEqual({ facts: { missing: 'invoice' }, context: {} });
    expect(await readState('expense.review', { expenseId: 'expense-b' }, 'tenant-a')).toEqual({ facts: { missing: 'expense' }, context: {} });
  });
  it('expense.review cannot mutate foreign target in a malformed proposal', async () => {
    await expect(getFloHandler('expense.review')!(context(proposal({ kind: 'expense.review', payload: { expenseId: 'expense-b' } })))).rejects.toThrow();
    expect(db.tables.expenses[0]!.is_reviewed).toBe(false);
  });
  it('chase rejects a foreign target before a reminder or event can be created', async () => {
    const ctx = chaseContext(true);
    await expect(getFloHandler('payment.chase')!(ctx)).rejects.toThrow('nie należy do organizacji');
    expect(db.tables.payment_reminders).toHaveLength(0);
    expect(db.writes).toBe(0);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('chase uses current paused state instead of proposal facts', async () => {
    const ctx = chaseContext();
    db.tables.invoices.find((row) => row.id === ctx.proposal.payload.invoiceId)!.reminders_paused = true;
    await expect(getFloHandler('payment.chase')!(ctx)).rejects.toThrow('Dane faktury zmieniły się');
    expect(db.tables.payment_reminders).toHaveLength(0);
    expect(db.writes).toBe(0);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('chase denies a buyer without NIP before creating a reminder', async () => {
    const ctx = chaseContext(false, true);
    await expect(getFloHandler('payment.chase')!(ctx)).rejects.toThrow('NIP');
    expect(db.tables.payment_reminders).toHaveLength(0);
    expect(db.writes).toBe(0);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('chase checks only own payments and still blocks the recent payment date', async () => {
    const ctx = chaseContext();
    const invoiceId = ctx.proposal.payload.invoiceId;
    db.tables.payments.push({ id: 'pay-b', tenant_id: 'tenant-b', invoice_id: invoiceId, payment_date: '2099-01-01' });
    const own = { id: 'pay-a', tenant_id: ctx.proposal.tenant_id, invoice_id: invoiceId,
      payment_date: new Date().toISOString().slice(0, 10), created_at: '2020-01-01T00:00:00Z' };
    db.tables.payments.push(own);
    await expect(getFloHandler('payment.chase')!(ctx)).rejects.toThrow('ostatnich dwóch dni');
    expect(db.tables.payment_reminders).toHaveLength(0);
    expect(mock.send).not.toHaveBeenCalled();
    // Moving only the owned payment out of the safety window allows delivery;
    // the foreign tenant's future payment must remain invisible to this check.
    own.payment_date = '2020-01-01';
    await getFloHandler('payment.chase')!(ctx);
    expect(db.tables.payment_reminders[0]).toMatchObject({
      id: ctx.approvalId, tenant_id: ctx.proposal.tenant_id, invoice_id: invoiceId,
    });
    expect(db.tables.flo_approvals[0]!.snapshot).toMatchObject({
      reminderDispatch: { reminderId: ctx.approvalId, invoiceId, stage: 'stage_1' },
    });
    expect(mock.send).toHaveBeenCalledOnce();
  });
});

describe('FLO execution authorization', () => {
  function seed(tenant = 'tenant-a', user = 'user-a') {
    const payload = { topic: 'synthetic' };
    db.tables.flo_proposals.push({ ...proposal({ kind: 'wrapped.ready', payload, fingerprint: fingerprintOf(payload) }) });
    db.tables.flo_approvals.push({ id: 'approval-a', proposal_id: 'proposal-a', tenant_id: tenant, user_id: user, snapshot: { approvalVersion: 1, proposalVersion: version, operationHash: approvalOperationHash(version) }, consumed_at: null, expires_at: '2026-09-17T00:00:00Z' });
  }
  const version = proposalApprovalVersion(proposal({ kind: 'wrapped.ready', payload: { topic: 'synthetic' }, fingerprint: fingerprintOf({ topic: 'synthetic' }) }));
  const args = { proposalVersion: version, proposalId: 'proposal-a', tenantId: 'tenant-a', userId: 'user-a', approvalId: 'approval-a' };
  it('does not load or change another tenant proposal', async () => {
    seed();
    const result = await executeProposal({ ...args, tenantId: 'tenant-b' }, NOW, db.client);
    expect(result.ok).toBe(false);
    expect(db.writes).toBe(0);
    expect(mock.kill).not.toHaveBeenCalled();
  });
  it.each(['global', 'lookup_error', 'tenant', 'code', 'canary'])('blocks existing cards for %s without consuming approval', async (layer) => {
    seed();
    if (layer === 'global') mock.kill.mockResolvedValue(true);
    if (layer === 'lookup_error') mock.kill.mockRejectedValue(new Error('offline'));
    if (layer === 'tenant') db.tables.flo_kind_flags.push({ tenant_id: 'tenant-a', kind: 'wrapped.ready', enabled: false });
    if (layer === 'code') db.tables.flo_proposals[0]!.kind = 'payment.score';
    if (layer === 'canary') db.tables.flo_proposals[0]!.kind = 'payment.chase';
    const result = await executeProposal(args, NOW, db.client);
    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    expect(db.tables.flo_proposals[0]!.status).toBe('open');
    expect(db.tables.flo_approvals[0]!.consumed_at).toBeNull();
    expect(db.writes).toBe(0);
  });
  it.each([['tenant-b', 'user-a'], ['tenant-a', 'user-b']])('does not consume approval for %s/%s', async (tenant, user) => {
    seed(tenant, user);
    const result = await executeProposal(args, NOW, db.client);
    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    expect(db.tables.flo_approvals[0]!.consumed_at).toBeNull();
  });
});

describe('FLO undo boundaries', () => {
  function seedUndo(fields = { kpir_column: null } as Record<string, string | null>) {
    db.tables.flo_proposals.push({ ...proposal({ kind: 'expense.review', status: 'done', payload: { undo: { at: NOW.toISOString(), table: 'expenses', rowId: 'expense-b', before: fields, after: { kpir_column: 'col_13' } } } }) });
  }
  it('does not restore another tenant target from an own proposal', async () => {
    seedUndo();
    const result = await undoAction('proposal-a', 'user-a', 'tenant-a', NOW, db.client, db.client as never);
    expect(result.ok).toBe(false);
    expect(db.tables.expenses[0]!.kpir_column).toBe('col_13');
    expect(mock.audit).not.toHaveBeenCalled();
  });
  it('does not load a foreign proposal', async () => {
    seedUndo();
    const result = await undoAction('proposal-a', 'user-b', 'tenant-b', NOW, db.client, db.client as never);
    expect(result.ok).toBe(false);
    expect(db.writes).toBe(0);
  });
  it('rejects unexpected fields instead of changing ownership', async () => {
    seedUndo({ tenant_id: 'tenant-a' });
    const result = await undoAction('proposal-a', 'user-a', 'tenant-a', NOW, db.client, db.client as never);
    expect(result).toMatchObject({ ok: false, reason: 'not_undoable' });
    expect(db.writes).toBe(0);
  });
});

it('undo preserves a manual edit made between read and restore', async () => {
  const rows = createFakeDb({
    expenses: [{ id: 'expense-a', tenant_id: 'tenant-a', kpir_column: 'col_13' }],
  }, () => { rows.tables.expenses[0]!.kpir_column = 'col_10'; });
  db.tables.flo_proposals.push({ ...proposal({ payload: { undo: {
    at: NOW.toISOString(), table: 'expenses', rowId: 'expense-a',
    before: { kpir_column: null }, after: { kpir_column: 'col_13' },
  } } }) });
  const result = await undoAction('proposal-a', 'user-a', 'tenant-a', NOW, db.client, rows.client as never);
  expect(result).toMatchObject({ ok: false, reason: 'changed' });
  expect(rows.tables.expenses[0]!.kpir_column).toBe('col_10');
  expect(mock.audit).not.toHaveBeenCalled();
});

it('returns stale if an open proposal is refreshed during the atomic claim', async () => {
  const payload = { topic: 'original' };
  let refreshed = false;
  const racing = createFakeDb({
    flo_proposals: [{ ...proposal({ kind: 'wrapped.ready', payload, fingerprint: fingerprintOf(payload) }) }],
    flo_approvals: [{ id: 'approval-a', proposal_id: 'proposal-a', tenant_id: 'tenant-a', user_id: 'user-a', snapshot: {}, consumed_at: null, expires_at: '2026-09-17T00:00:00Z' }],
  }, () => {
    if (!refreshed) {
      refreshed = true;
      racing.tables.flo_proposals[0]!.payload = { topic: 'refreshed' };
      racing.tables.flo_proposals[0]!.fingerprint = fingerprintOf({ topic: 'refreshed' });
    }
  });
  const result = await executeProposal({
    proposalVersion: proposalApprovalVersion(proposal({ kind: 'wrapped.ready', payload, fingerprint: fingerprintOf(payload) })),
    proposalId: 'proposal-a', tenantId: 'tenant-a', userId: 'user-a', approvalId: 'approval-a',
  }, NOW, racing.client);
  expect(result).toMatchObject({ ok: false, reason: 'stale' });
  expect(racing.tables.flo_proposals[0]!.status).toBe('open');
  expect(racing.tables.flo_approvals[0]!.consumed_at).toBeNull();
  expect(mock.audit).not.toHaveBeenCalled();
});

it('does not claim completion when execution is still in progress', async () => {
  db.tables.flo_proposals.push({ ...proposal({ status: 'executing' }) });
  const result = await executeProposal({
    proposalVersion: proposalApprovalVersion(proposal()),
    proposalId: 'proposal-a', tenantId: 'tenant-a', userId: 'user-a', approvalId: 'approval-a',
  }, NOW, db.client);
  expect(result).toMatchObject({ ok: false, reason: 'blocked' });
  expect(db.writes).toBe(0);
});

it('records the payment date in Poland when the UTC day differs', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-09-16T22:30:00Z'));
    await getFloHandler('payment.confirm')!(context(proposal(), { value: '1' }));
    expect(db.tables.payments[0]!.payment_date).toBe('2026-09-17');
  } finally {
    vi.useRealTimers();
  }
});

it('rejects a legacy invoice-only payment undo instead of changing a trigger-derived total', async () => {
  db.tables.flo_proposals.push({ ...proposal({ kind: 'payment.confirm', payload: { undo: {
    at: NOW.toISOString(), table: 'invoices', rowId: 'invoice-a',
    before: { paid_amount: 0 }, after: { paid_amount: 100 },
  } } }) });
  db.tables.invoices[0]!.paid_amount = 100;
  db.tables.payments.push({ id: 'payment-a', tenant_id: 'tenant-a', invoice_id: 'invoice-a', amount: 100 });
  const result = await undoAction('proposal-a', 'user-a', 'tenant-a', NOW, db.client, db.client as never);
  expect(result).toMatchObject({ ok: false, reason: 'not_undoable' });
  expect(db.tables.invoices[0]!.paid_amount).toBe(100);
  expect(db.tables.payments).toHaveLength(1);
  expect(db.writes).toBe(0);
});
