import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  getClaims: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  range: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.session }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import { searchAuditLogs } from '@/lib/admin/audit';

const operator = { id: 'operator-fixture', email: 'operator@example.test', email_confirmed_at: '2026-09-14T00:00:00Z', factors: [{ id: 'factor-fixture', factor_type: 'totp', status: 'verified' }] };
const rows = ['tenant-a', 'tenant-b'].map((tenantId, index) => ({
  id: 'audit-' + index,
  action: 'invoice.xml_downloaded',
  entity_type: 'invoice',
  entity_id: 'invoice-' + index,
  tenant_id: tenantId,
  user_id: 'user-' + index,
  metadata: { via: 'synthetic-fixture' },
  created_at: '2026-09-13T10:00:00.000Z',
  user_agent: null,
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_EMAILS', operator.email);
  mocks.session.mockResolvedValue({ auth: { getUser: mocks.getUser, getSession: mocks.getSession, getClaims: mocks.getClaims } });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: operator.id, aal: 'aal2' } }, error: null });
  mocks.redirect.mockImplementation((target: string) => {
    throw new Error('test-redirect:' + target);
  });
  const query = {
    select: () => query,
    order: () => query,
    range: mocks.range,
  };
  mocks.from.mockReturnValue(query);
  mocks.admin.mockReturnValue({ from: mocks.from });
  mocks.range.mockResolvedValue({ data: rows, count: rows.length, error: null });
});

afterEach(() => { vi.unstubAllEnvs(); });

describe('admin audit data access', () => {
  it.each([
    { name: 'missing session', user: null, destination: '/login?error=admin_required' },
    { name: 'ordinary authenticated member', user: { id: 'member-fixture', email: 'member@example.test' }, destination: '/dashboard' },
  ])('rejects $name before creating a service-role client', async ({ user, destination }) => {
    mocks.getUser.mockResolvedValue({ data: { user } });
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: user?.id, aal: 'aal2' } }, error: null });

    await expect(searchAuditLogs()).rejects.toThrow('test-redirect:' + destination);

    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.range).not.toHaveBeenCalled();
  });

  it('waits for verified administrator identity before allowing the cross-tenant search', async () => {
    let authorize!: (value: { data: { user: typeof operator } }) => void;
    mocks.getUser.mockReturnValue(new Promise<{ data: { user: typeof operator } }>((resolve) => {
      authorize = resolve;
    }));

    const pendingSearch = searchAuditLogs();
    await vi.waitFor(() => expect(mocks.getUser).toHaveBeenCalledOnce());
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.range).not.toHaveBeenCalled();

    authorize({ data: { user: operator } });
    const result = await pendingSearch;

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith('audit_logs');
    expect(mocks.range).toHaveBeenCalledWith(0, 99);
    expect(result.total).toBe(2);
    expect(result.items.map((row) => row.tenantId)).toEqual(['tenant-a', 'tenant-b']);
  });
});
