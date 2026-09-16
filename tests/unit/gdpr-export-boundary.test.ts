import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), verified: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/auth/verified-user', () => ({ getVerifiedUserContext: mocks.verified }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
import { collectUserData } from '@/lib/gdpr/data-collector';
import { GET } from '@/app/api/gdpr/export/route';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PRIVATE = 'private-row-and-auth-diagnostic';
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let failedTable: string | null;
let rowLimit: number;
let authError: boolean;
let authId: string;
let tablesRead: string[];
let omitCount: boolean;

beforeEach(() => {
  vi.resetAllMocks();
  failedTable = null; rowLimit = 1000; authError = false; authId = USER;
  tablesRead = []; omitCount = false;
  rows = {
    memberships: [
      { id: 'm1', user_id: USER, organization_id: 'active-org', role: 'owner', status: 'active' },
      { id: 'm2', user_id: USER, organization_id: 'revoked-org', role: 'owner', status: 'revoked' },
      { id: 'm3', user_id: OTHER, organization_id: 'private-org', role: 'owner', status: 'active' },
    ],
    audit_logs: [
      { id: 'a1', user_id: USER, action: 'own-action' },
      { id: 'a2', user_id: OTHER, action: PRIVATE },
    ],
  };
  mocks.verified.mockResolvedValue({ ok: true, user: { id: USER } });
  mocks.audit.mockResolvedValue(undefined);
  mocks.admin.mockImplementation(() => ({
    auth: { admin: { getUserById: async () => ({
      data: { user: { id: authId, email: 'own@example.test', created_at: '2026-01-01', user_metadata: {} } },
      error: authError ? { message: PRIVATE } : null,
    }) } },
    from: (table: string) => {
      tablesRead.push(table);
      if (!rows[table]) throw new Error('Unexpected table: ' + table);
      const filters: Array<[string, unknown]> = [];
      let limit = 1000;
      const query = {
        select: (_columns: string, opts: { count: string }) => {
          expect(opts.count).toBe('exact'); return query;
        },
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        order: () => query,
        limit: (value: number) => { limit = value; return query; },
        returns: async () => {
          const selected = rows[table].filter((row) => filters.every(([key, value]) => row[key] === value));
          return { data: selected.slice(0, Math.min(limit, rowLimit)),
            count: omitCount ? null : selected.length,
            error: failedTable === table ? { message: PRIVATE } : null };
        },
      };
      return query;
    },
  }));
});

describe('bounded account export', () => {
  it('exports only the verified account, never organizational invoices or other users', async () => {
    const data = await collectUserData(USER);
    expect(data.format_version).toBe(2);
    expect(data.memberships.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(data.audit_logs.map((a) => a.id)).toEqual(['a1']);
    expect(data.organizations_owned).toEqual([{ organization_id: 'active-org', role: 'owner' }]);
    expect(data.organization_invoices.included).toBe(false);
    expect(tablesRead).toEqual(['memberships', 'audit_logs']);
    expect(JSON.stringify(data)).not.toContain(PRIVATE);
    expect(data).not.toHaveProperty('invoices_count');
  });

  it('reports a database row cap honestly rather than pretending completeness', async () => {
    rowLimit = 1;
    const data = await collectUserData(USER);
    expect(data.coverage.memberships).toEqual({ returned: 1, total: 2, truncated: true });
    expect(data.coverage.audit_logs).toEqual({ returned: 1, total: 1, truncated: false });
  });

  it.each(['memberships', 'audit_logs'])('refuses partial success on %s errors', async (table) => {
    failedTable = table;
    await expect(collectUserData(USER)).rejects.toThrow(/^account_export_data_unavailable$/);
  });

  it('refuses an unknown result count', async () => {
    omitCount = true;
    await expect(collectUserData(USER)).rejects.toThrow(/^account_export_count_unavailable$/);
  });

  it.each(['error', 'other-user'])('rejects an invalid Auth result: %s', async (mode) => {
    authError = mode === 'error'; authId = mode === 'other-user' ? OTHER : USER;
    await expect(collectUserData(USER)).rejects.toThrow(/^account_export_user_unavailable$/);
    expect(tablesRead).toEqual([]);
  });
});

describe('account export endpoint', () => {
  it.each([
    ['unauthenticated', 401], ['mfa_required', 403], ['verification_failed', 503],
  ])('rejects %s before creating privileged clients', async (reason, status) => {
    mocks.verified.mockResolvedValue({ ok: false, reason });
    const response = await GET();
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('returns a private download and audits the actual scope', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect((await response.json()).user.id).toBe(USER);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER, metadata: expect.objectContaining({ format_version: 2 }),
    }));
  });

  it('does not leak raw exceptions or record export success on failure', async () => {
    mocks.admin.mockImplementation(() => { throw new Error(PRIVATE); });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await GET();
      expect(response.status).toBe(500);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(await response.json()).toEqual({ error: 'export_failed' });
      expect(JSON.stringify(log.mock.calls)).not.toContain(PRIVATE);
      expect(mocks.audit).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
