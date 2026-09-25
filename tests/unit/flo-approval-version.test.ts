import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { FloDbClient, FloProposalRow } from '@/lib/flo/db-types';
import type { FloApproveInput } from '@/types/flo';
import { createFakeDb, type FakeDb } from './flo-fake-db';

const mock = vi.hoisted(() => ({ client: null as unknown, audit: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mock.client }));
vi.mock('@/lib/supabase/auth-context', () => ({ requireUserAndActiveOrg: async () => ({ tenantId: 'tenant-a', user: { id: 'user-a' } }) }));
vi.mock('@/lib/feature-flags/global-flags', () => ({ getGlobalFlagForExecution: async () => false, getGlobalFlag: async () => false }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mock.audit }));
vi.mock('@/lib/flo/functions', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: mock.revalidate }));
import { approvalOperationHash, parseApprovalInput, proposalApprovalVersion } from '@/lib/flo/approval-version';
import { createApproval, consumeApproval } from '@/lib/flo/approval';
import { executeProposal } from '@/lib/flo/execute';
import { createProposal, toProposalView } from '@/lib/flo/proposals';
import { fingerprintOf } from '@/lib/flo/fingerprint';
import { registerFloHandler, resetFloHandlers, type FloHandler } from '@/lib/flo/handlers';
import { approveProposal } from '@/app/actions/flo';

const NOW = new Date('2026-09-23T12:00:00Z');
const payload = { topic: 'synthetic', recipient: 'one@example.invalid', text: 'Version A' };
function proposal(overrides: Partial<FloProposalRow> = {}): FloProposalRow {
  return { id: 'proposal-a', tenant_id: 'tenant-a', kind: 'wrapped.ready', topic_key: 'wrapped:synthetic', status: 'open', priority: 50,
    title: 'Synthetic proposal A', body: 'Content A', payload, evidence: [], fingerprint: fingerprintOf(payload),
    expires_at: '2026-09-24T12:00:00.000Z', created_at: NOW.toISOString(), approved_at: null, approved_by: null,
    executed_at: null, dismissed_reason: null, ...overrides };
}
function consent(row = proposal(), input?: FloApproveInput) {
  const version = proposalApprovalVersion(row);
  return { proposalId: row.id, tenantId: row.tenant_id, userId: 'user-a', snapshot: {
    approvalVersion: 1, proposalVersion: version, operationHash: approvalOperationHash(version, input), input: input ?? null,
    title: row.title, body: row.body, payload: row.payload,
  } };
}
function args(approvalId: string, row = proposal(), input?: FloApproveInput) {
  return { proposalId: row.id, tenantId: row.tenant_id, userId: 'user-a', approvalId, proposalVersion: proposalApprovalVersion(row), input };
}
let db: FakeDb;
const handler = vi.fn<FloHandler>(async () => ({ summary: 'synthetic effect' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
  db = createFakeDb({ flo_proposals: [{ ...proposal() }] }); mock.client = db.client;
  resetFloHandlers(); handler.mockClear(); mock.audit.mockClear(); registerFloHandler('wrapped.ready', handler);
});
afterEach(() => vi.useRealTimers());

describe('FLO consent version', () => {
  it.each([
    { title: 'Changed title' }, { body: 'Changed body' }, { kind: 'invoice.batch' }, { tenant_id: 'tenant-b' },
    { fingerprint: 'new facts' }, { expires_at: '2026-09-25T00:00:00Z' },
    { payload: { ...payload, recipient: 'two@example.invalid' } }, { payload: { ...payload, text: 'Version B' } },
    { evidence: [{ label: 'Changed evidence', href: '/invoices/synthetic' }] },
  ])('binds the whole operation: %j', (change) => {
    expect(proposalApprovalVersion(proposal(change))).not.toBe(proposalApprovalVersion(proposal()));
  });
  it('uses canonical JSON and excludes lifecycle transitions', () => {
    const a = proposal({ payload: { b: 2, a: { c: 3, d: 4 } } });
    const b = { ...a, status: 'executing' as const, payload: { a: { d: 4, c: 3 }, b: 2 } };
    expect(proposalApprovalVersion(a)).toBe(proposalApprovalVersion(b));
  });
  it('gives the browser the version of the displayed proposal', () => {
    expect(toProposalView(proposal())?.approvalVersion).toBe(proposalApprovalVersion(proposal()));
  });
  it('rejects a stale displayed card before writing a token or executing', async () => {
    db.tables.flo_proposals[0]!.body = 'Content B';
    expect(await approveProposal('proposal-a', proposalApprovalVersion(proposal()))).toMatchObject({ ok: false, reason: 'stale' });
    expect(db.tables.flo_approvals).toHaveLength(0); expect(handler).not.toHaveBeenCalled(); expect(db.writes).toBe(0);
  });
  it('accepts a current card and records the exact user input', async () => {
    const input = { editedBody: 'My message', selectedIds: ['invoice-a'], value: '1.25' };
    expect(await approveProposal('proposal-a', proposalApprovalVersion(proposal()), input)).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ input, snapshot: { input, proposalVersion: proposalApprovalVersion(proposal()) } });
  });
  it('rejects a legacy browser card and malformed input without writes', async () => {
    expect(await approveProposal('proposal-a', '')).toMatchObject({ ok: false, reason: 'stale' });
    expect(await approveProposal('proposal-a', proposalApprovalVersion(proposal()), { value: 'x'.repeat(4001) })).toMatchObject({ ok: false, reason: 'blocked' });
    expect(db.writes).toBe(0); expect(handler).not.toHaveBeenCalled();
  });
  it('does not apply a token A after createProposal refreshes the same open ID to B', async () => {
    const token = await createApproval(consent(), db.client);
    const result = await createProposal({ tenantId: 'tenant-a', kind: 'wrapped.ready', topicKey: 'wrapped:synthetic',
      title: 'Changed title', body: 'Content B', payload: { ...payload, recipient: 'two@example.invalid' },
      fingerprint: proposal().fingerprint, expiresAt: new Date(proposal().expires_at),
    }, db.client, async () => false);
    expect(result).toEqual({ status: 'updated', id: 'proposal-a' });
    expect(await executeProposal(args(token), NOW, db.client)).toMatchObject({ ok: false, reason: 'stale' });
    expect(handler).not.toHaveBeenCalled(); expect(db.tables.flo_approvals[0]!.consumed_at).toBeNull();
  });
  it('checks content returned by the claim even when the facts fingerprint did not change', async () => {
    let refreshed = false;
    const racing = createFakeDb({ flo_proposals: [{ ...proposal() }], flo_approvals: [{ id: 'token', proposal_id: 'proposal-a', tenant_id: 'tenant-a', user_id: 'user-a', snapshot: consent().snapshot, consumed_at: null, expires_at: '2026-09-24T00:00:00Z' }] }, () => {
      if (!refreshed) { refreshed = true; racing.tables.flo_proposals[0]!.payload = { ...payload, text: 'Version B' }; }
    });
    expect(await executeProposal(args('token'), NOW, racing.client)).toMatchObject({ ok: false, reason: 'stale' });
    expect(handler).not.toHaveBeenCalled(); expect(racing.tables.flo_proposals[0]!.status).toBe('open');
    expect(racing.tables.flo_approvals[0]!.consumed_at).toBeNull();
  });
  it('rejects a different operation even if caller supplies the current proposal version with an old token', async () => {
    const token = await createApproval(consent(), db.client);
    const changed = proposal({ body: 'Content B' }); Object.assign(db.tables.flo_proposals[0]!, changed);
    expect(await executeProposal(args(token, changed), NOW, db.client)).toMatchObject({ ok: false, reason: 'blocked' });
    expect(handler).not.toHaveBeenCalled(); expect(db.tables.flo_approvals[0]!.consumed_at).toBeNull();
  });
  it.each([{ value: '10' }, { selectedIds: ['invoice-b'] }, { editedBody: 'Changed message' }])('rejects changed input %j', async (input) => {
    const token = await createApproval(consent(), db.client);
    expect(await executeProposal(args(token, proposal(), input), NOW, db.client)).toMatchObject({ ok: false, reason: 'blocked' });
    expect(handler).not.toHaveBeenCalled(); expect(db.tables.flo_approvals[0]!.consumed_at).toBeNull();
  });
  it('does not consume legacy tokens without binding', async () => {
    db.tables.flo_approvals.push({ id: 'legacy', proposal_id: 'proposal-a', tenant_id: 'tenant-a', user_id: 'user-a', snapshot: {}, consumed_at: null, expires_at: '2026-09-24T00:00:00Z' });
    expect(await executeProposal(args('legacy'), NOW, db.client)).toMatchObject({ ok: false, reason: 'blocked' });
    expect(handler).not.toHaveBeenCalled(); expect(db.tables.flo_approvals[0]!.consumed_at).toBeNull();
  });
  it('reuses only the same operation, replacing a different unconsumed approval on a new click', async () => {
    const first = await createApproval(consent(), db.client);
    expect(await createApproval(consent(), db.client)).toBe(first);
    const second = await createApproval(consent(proposal(), { value: '2' }), db.client);
    expect(second).not.toBe(first); expect(db.tables.flo_approvals[0]!.consumed_at).toBe(NOW.toISOString());
    expect(await executeProposal(args(second, proposal(), { value: '2' }), NOW, db.client)).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledOnce();
  });
  it('does not reuse or retire another user live token', async () => {
    await createApproval({ ...consent(), userId: 'user-b' }, db.client);
    await expect(createApproval(consent(), db.client)).rejects.toThrow();
    expect(db.tables.flo_approvals).toHaveLength(1); expect(db.tables.flo_approvals[0]!.consumed_at).toBeNull();
  });
  it('retires expired tokens so the partial unique index cannot block a fresh consent', async () => {
    const first = await createApproval({ ...consent(), ttlMinutes: -1 }, db.client);
    const second = await createApproval(consent(), db.client);
    expect(second).not.toBe(first); expect(db.tables.flo_approvals[0]!.consumed_at).toBe(NOW.toISOString());
    expect(await executeProposal(args(second), NOW, db.client)).toEqual({ ok: true });
  });
  it('does not overwrite a concurrent dismissal when releasing a rejected claim', async () => {
    let updates = 0;
    const racing = createFakeDb({ flo_proposals: [{ ...proposal() }] }, () => {
      updates++;
      if (updates === 1) racing.tables.flo_proposals[0]!.body = 'Content B';
      if (updates === 2) racing.tables.flo_proposals[0]!.status = 'dismissed';
    });
    expect(await executeProposal(args('missing'), NOW, racing.client)).toMatchObject({ ok: false, reason: 'stale' });
    expect(racing.tables.flo_proposals[0]!.status).toBe('dismissed'); expect(handler).not.toHaveBeenCalled();
  });
  it('validates input before accepting a token', () => {
    expect(() => parseApprovalInput({ recipient: 'unexpected@example.invalid' })).toThrow();
    expect(() => parseApprovalInput({ selectedIds: Array(1001).fill('x') })).toThrow();
  });
  it('puts consent version and input hash into one actual PostgREST UPDATE', async () => {
    const requests: { url: URL; method: string }[] = [];
    const snapshot = consent().snapshot;
    const sdk = createClient('https://database.example.invalid', 'synthetic-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, init) => {
        requests.push({ url: new URL(String(url)), method: init?.method ?? 'GET' });
        return new Response(JSON.stringify([{ snapshot }]), { status: 200, headers: { 'content-type': 'application/json' } });
      } },
    }) as unknown as FloDbClient;
    await expect(consumeApproval('token', 'proposal-a', 'tenant-a', 'user-a', snapshot.proposalVersion, undefined, NOW, sdk)).resolves.toEqual(snapshot);
    expect(requests).toHaveLength(1); expect(requests[0]!.method).toBe('PATCH');
    const query = requests[0]!.url.searchParams;
    expect(query.get('snapshot->>approvalVersion')).toBe('eq.1');
    expect(query.get('snapshot->>proposalVersion')).toBe('eq.' + snapshot.proposalVersion);
    expect(query.get('snapshot->>operationHash')).toBe('eq.' + snapshot.operationHash);
    expect(query.get('tenant_id')).toBe('eq.tenant-a'); expect(query.get('user_id')).toBe('eq.user-a');
    expect(query.get('consumed_at')).toBe('is.null');
  });
});
