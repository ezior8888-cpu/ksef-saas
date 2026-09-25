import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, type FakeDb } from './flo-fake-db';
import { proposalApprovalVersion } from '@/lib/flo/approval-version';
import type { FloProposalRow } from '@/lib/flo/db-types';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: null as unknown, budget: vi.fn(), build: vi.fn(), decide: vi.fn(), fingerprint: vi.fn(), enabled: vi.fn() }));
vi.mock('@/lib/flo/kind-switch', () => ({ isKindEnabledForTenant: mocks.enabled }));
vi.mock('@/lib/feature-flags/global-flags', () => ({ getGlobalFlagForExecution: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.client }));
vi.mock('@/lib/supabase/auth-context', () => ({ requireUserAndTenant: mocks.auth, requireOrgRole: mocks.auth, ActionAuthError: class extends Error {} }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.budget }));
vi.mock('@/lib/reminders/prepare-delivery', () => ({ buildReminderDelivery: mocks.build }));
vi.mock('@/lib/reminders/scheduler', () => ({ decideNextReminder: mocks.decide }));
vi.mock('@/lib/flo/fingerprint', () => ({ computeFingerprint: mocks.fingerprint }));
import { prepareReminderAction, triggerManualReminderAction } from '@/app/actions/reminders';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const SOURCE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-09-23T12:00:00.000Z');
const delivery = { version: 1, tenantId: A, invoiceId: ID, stage: 'stage_1', preparedAt: NOW.toISOString(),
  expiresAt: '2026-09-23T12:30:00.000Z', sourceFingerprint: 'a'.repeat(64), from: 'Fixture <sender@example.invalid>',
  to: 'buyer@example.invalid', replyTo: null, subject: 'Fixture', text: 'Preview text', attachment: null, daysOverdue: 2 };
let db: FakeDb;
function source(): FloProposalRow {
  return { id: SOURCE, tenant_id: A, kind: 'payment.chase', topic_key: 'chase:fixture', status: 'open',
    title: 'Fixture', body: 'Fixture', payload: { invoiceId: ID, stage: 'stage_1' }, fingerprint: 'fixture',
    priority: 10, evidence: [], expires_at: '2026-09-24T00:00:00.000Z', created_at: NOW.toISOString(),
    approved_at: null, approved_by: null, executed_at: null, dismissed_reason: null };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
  db = createFakeDb({ invoices: [{ id: ID, tenant_id: A, buyer_data: { email: 'buyer@example.invalid' }, gross_total: 100, paid_amount: 0 }] });
  mocks.client = db.client; mocks.auth.mockResolvedValue({ tenantId: A, user: { id: USER }, supabase: db.client });
  mocks.enabled.mockResolvedValue({ enabled: true });
  mocks.budget.mockResolvedValue({ allowed: true }); mocks.build.mockResolvedValue(delivery);
  mocks.decide.mockResolvedValue({ shouldSend: true, stage: 'stage_1' });
  mocks.fingerprint.mockResolvedValue({ fingerprint: 'fixture', state: { facts: { grossTotal: 100 } } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('prepare reminder action', () => {
  it('persists a preview and its exact version, without creating a reminder or approval', async () => {
    const result = await prepareReminderAction({ invoiceId: ID, stage: 'stage_1' });
    expect(result).toMatchObject({ success: true, expiresAt: delivery.expiresAt, preview: {
      from: delivery.from, to: delivery.to, subject: delivery.subject, body: delivery.text, attachment: null } });
    const stored = db.tables.flo_proposals[0]!;
    expect(stored.payload).toMatchObject({ invoiceId: ID, stage: 'stage_1', preparedBy: USER, delivery });
    expect(stored.topic_key).toMatch(/^reminder-preview:/);
    expect(result).toMatchObject({ approvalVersion: proposalApprovalVersion(stored as unknown as FloProposalRow) });
    expect(db.tables.payment_reminders).toEqual([]); expect(db.tables.flo_approvals).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.budget).toHaveBeenCalledWith({ bucket: 'reminder_preview', identifier: A, limit: 20, windowSeconds: 600 });
  });
  it.each([{ allowed: false }, { allowed: true, fallback: true }])('blocks unavailable/exhausted preview budget %# before reads/rendering', async (budget) => {
    mocks.budget.mockResolvedValue(budget);
    expect(await prepareReminderAction({ invoiceId: ID })).toMatchObject({ success: false });
    expect(db.writes).toBe(0); expect(mocks.build).not.toHaveBeenCalled();
  });
  it('rejects disabled reminders before building a preview', async () => {
    mocks.enabled.mockResolvedValue({ enabled: false });
    expect(await prepareReminderAction({ invoiceId: ID })).toMatchObject({ success: false });
    expect(mocks.build).not.toHaveBeenCalled(); expect(db.writes).toBe(0);
  });
  it('does not inspect another organization invoice', async () => {
    db.tables.invoices[0]!.tenant_id = B;
    expect(await prepareReminderAction({ invoiceId: ID, stage: 'stage_1' })).toMatchObject({ success: false });
    expect(mocks.build).not.toHaveBeenCalled(); expect(db.writes).toBe(0);
  });
  it('requires authentication and does not reflect private errors', async () => {
    mocks.auth.mockRejectedValue(new Error('private-session-detail'));
    const result = await prepareReminderAction({ invoiceId: ID });
    expect(result).toMatchObject({ success: false }); expect(JSON.stringify(result)).not.toContain('private-session-detail');
    expect(mocks.budget).not.toHaveBeenCalled(); expect(db.writes).toBe(0);
  });
  it.each([
    { invoiceId: 'invalid' }, { invoiceId: ID, recipientEmail: 'one@example.invalid,two@example.invalid' },
    { invoiceId: ID, sourceProposalId: SOURCE }, { invoiceId: ID, sourceVersion: 'a'.repeat(64) },
  ])('rejects malformed requests %# before authentication', async (input) => {
    expect(await prepareReminderAction(input)).toMatchObject({ success: false });
    expect(mocks.auth).not.toHaveBeenCalled(); expect(db.writes).toBe(0);
  });
  it('passes the explicit address to scheduling and preparation without overwriting the invoice', async () => {
    expect(await prepareReminderAction({ invoiceId: ID, recipientEmail: 'chosen@example.invalid' })).toMatchObject({ success: true });
    expect(mocks.decide).toHaveBeenCalledWith(expect.objectContaining({ buyer_data: { email: 'chosen@example.invalid' } }));
    expect(mocks.build).toHaveBeenCalledWith(A, ID, 'stage_1', 'chosen@example.invalid');
    expect(db.tables.invoices[0]!.buyer_data).toEqual({ email: 'buyer@example.invalid' });
  });
  it('blocks a stage with a service-only dispatch even if the reminder row was deleted', async () => {
    db.tables.flo_approvals.push({ id: SOURCE, tenant_id: A, snapshot: { reminderDispatch: { invoiceId: ID, stage: 'stage_1' } } });
    expect(await prepareReminderAction({ invoiceId: ID, stage: 'stage_1' })).toMatchObject({ success: false });
    expect(mocks.build).not.toHaveBeenCalled(); expect(db.writes).toBe(0);
  });
  it('requires the current source proposal and invoice/stage', async () => {
    const row = source(); db.tables.flo_proposals.push({ ...row });
    const input = { invoiceId: ID, stage: 'stage_1' as const, sourceProposalId: SOURCE, sourceVersion: proposalApprovalVersion(row) };
    expect(await prepareReminderAction(input)).toMatchObject({ success: true });
    mocks.build.mockClear(); db.tables.flo_proposals[0]!.body = 'Changed';
    expect(await prepareReminderAction(input)).toMatchObject({ success: false }); expect(mocks.build).not.toHaveBeenCalled();
  });
  it('refuses old direct-send clients without producing any side effect', async () => {
    expect(await triggerManualReminderAction(ID)).toMatchObject({ success: false });
    expect(mocks.auth).not.toHaveBeenCalled(); expect(db.writes).toBe(0); expect(fetch).not.toHaveBeenCalled();
  });
});
