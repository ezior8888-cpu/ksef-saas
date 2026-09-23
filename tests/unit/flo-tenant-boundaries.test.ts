import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FloProposalRow } from '@/lib/flo/db-types';
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
    body: 'Synthetic', payload: { invoices: [{ invoiceId: 'invoice-a', outstanding: 100 }] },
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
describe('FLO entity boundaries', () => {
  it.each(['invoice-b', 'missing'])('rejects selected ID %s outside the proposal even for one grosz', async (id) => {
    await expect(getFloHandler('payment.confirm')!(context(proposal(), { selectedIds: [id], value: '0.01' }))).rejects.toThrow();
    expect(db.tables.payments).toHaveLength(0);
  });
  it('rejects a foreign invoice even if a malformed server proposal contains it', async () => {
    const row = proposal({ payload: { invoices: [{ invoiceId: 'invoice-b', outstanding: 100 }] } });
    await expect(getFloHandler('payment.confirm')!(context(row, { value: '1' }))).rejects.toThrow();
    expect(db.tables.payments).toHaveLength(0);
  });
  it.each(['0', '-1', 'Infinity', 'NaN', '0.001', '100.01', '1e2'])('rejects invalid or excessive amount %s', async (value) => {
    await expect(getFloHandler('payment.confirm')!(context(proposal(), { value }))).rejects.toThrow();
    expect(db.tables.payments).toHaveLength(0);
  });
  it('checks current balance rather than trusting a stale proposal', async () => {
    db.tables.invoices[0]!.paid_amount = 99;
    await expect(getFloHandler('payment.confirm')!(context(proposal(), { value: '2' }))).rejects.toThrow();
    expect(db.tables.payments).toHaveLength(0);
  });
  it('writes an owned partial payment using actual schema and without fictitious invoice undo', async () => {
    const result = await getFloHandler('payment.confirm')!(context(proposal(), { value: '1,25' }));
    expect(db.tables.payments[0]).toMatchObject({ tenant_id: 'tenant-a', invoice_id: 'invoice-a', amount: 1.25, is_confirmed: true, match_method: 'flo_confirmation' });
    expect(db.tables.payments[0]!.payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(db.tables.payments[0]).not.toHaveProperty('paid_at');
    expect(result.details).not.toHaveProperty('undo');
  });
  it('rejects missing or nonpositive proposed balance', async () => {
    for (const outstanding of [undefined, 0, -1, NaN, Infinity]) {
      const row = proposal({ payload: { invoices: [{ invoiceId: 'invoice-a', outstanding }] } });
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
    await expect(getFloHandler('payment.chase')!(context(proposal({ kind: 'payment.chase', payload: { invoiceId: 'invoice-b', stage: 'stage_1' } })))).rejects.toThrow();
    expect(db.tables.payment_reminders).toHaveLength(0);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('chase uses current paused state instead of proposal facts', async () => {
    db.tables.invoices[0]!.reminders_paused = true;
    await expect(getFloHandler('payment.chase')!(context(proposal({ kind: 'payment.chase', payload: { invoiceId: 'invoice-a', stage: 'stage_1', facts: { remindersPaused: 0 } } })))).rejects.toThrow();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('chase checks only own payments and uses payment_date', async () => {
    db.tables.payments.push({ id: 'pay-b', tenant_id: 'tenant-b', invoice_id: 'invoice-a', payment_date: '2099-01-01' });
    await getFloHandler('payment.chase')!(context(proposal({ kind: 'payment.chase', payload: { invoiceId: 'invoice-a', stage: 'stage_1' } })));
    expect(db.tables.payment_reminders[0]).toMatchObject({ tenant_id: 'tenant-a', invoice_id: 'invoice-a' });
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
