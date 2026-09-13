import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getUser: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  listUsers: vi.fn(),
  getUserById: vi.fn(),
  health: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.session }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/ksef/health-status', () => ({ getKsefHealthSnapshot: mocks.health }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/admin/refunds', () => ({ issueRefund: vi.fn() }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));

// requireAdmin remains real: the tests exercise verified identity and the allowlist.
import { listAdminUsers, getAdminUserDetail } from '@/lib/admin/users';
import { getAdminOverviewMetrics } from '@/lib/admin/metrics';
import { listUserPayments } from '@/app/admin/users/[userId]/billing-actions';

const operator = { id: 'operator-fixture', email: 'operator@example.test' };
const member = { id: 'member-fixture', email: 'member@example.test' };
const user = {
  id: 'user-fixture', email: 'user@example.test',
  created_at: '2026-09-01T10:00:00.000Z', last_sign_in_at: null,
  email_confirmed_at: '2026-09-01T10:01:00.000Z',
};
const memberships = ['a', 'b'].map((suffix) => ({
  user_id: user.id, organization_id: 'tenant-' + suffix,
  joined_at: '2026-09-02T10:00:00.000Z', role: 'owner', status: 'active',
  tenants: { name: 'Company ' + suffix, nip: '1234567890', ksef_verified_at: null },
}));
const rows: Record<string, object[]> = {
  memberships,
  invoices: [{ tenant_id: 'tenant-a' }, { tenant_id: 'tenant-a' }, { tenant_id: 'tenant-b' }],
  expenses: [{ tenant_id: 'tenant-b' }],
  audit_logs: [{
    id: 'audit-fixture', action: 'invoice.created', entity_type: 'invoice', entity_id: 'invoice-fixture',
    tenant_id: 'tenant-a', metadata: { source: 'synthetic-fixture' }, created_at: '2026-09-03T10:00:00.000Z',
  }],
  admin_user_notes: [{
    id: 'note-fixture', body: 'Synthetic operator note', author_email: operator.email,
    created_at: '2026-09-03T10:00:00.000Z', updated_at: '2026-09-03T10:00:00.000Z',
  }],
  stripe_payments: [{
    id: 'payment-fixture', tenant_id: 'tenant-a', stripe_invoice_id: null, amount_cents: 12000,
    currency: 'pln', status: 'paid', paid_at: '2026-09-04T10:00:00.000Z', tenants: { name: 'Company a' },
  }],
  stripe_refunds: [{ payment_id: 'payment-fixture', amount_cents: 2500 }],
  tenants: [{}, {}],
  organization_join_requests: [{}],
};

function query(table: string) {
  const data = rows[table] ?? [];
  const result = { data, count: data.length, error: null };
  const chain = {
    select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
    is: vi.fn(() => chain), not: vi.fn(() => chain), gte: vi.fn(() => chain),
    order: vi.fn(() => chain), limit: vi.fn(() => chain),
    then: <T>(resolve: (value: typeof result) => T | PromiseLike<T>) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_EMAILS', operator.email);
  vi.stubEnv('KSEF_ENV', 'test');
  mocks.session.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user: operator } });
  mocks.redirect.mockImplementation((target: string): never => {
    throw new Error('test-redirect:' + target);
  });
  mocks.from.mockImplementation(query);
  mocks.listUsers.mockResolvedValue({ data: { users: [user], total: 1 }, error: null });
  mocks.getUserById.mockResolvedValue({ data: { user }, error: null });
  mocks.admin.mockReturnValue({
    from: mocks.from,
    auth: { admin: { listUsers: mocks.listUsers, getUserById: mocks.getUserById } },
  });
  mocks.health.mockResolvedValue(null);
});

afterEach(() => { vi.unstubAllEnvs(); });

const readers = [
  { name: 'user listing', read: () => listAdminUsers() },
  { name: 'user details', read: () => getAdminUserDetail(user.id) },
  { name: 'platform metrics', read: () => getAdminOverviewMetrics() },
  { name: 'payment Server Action', read: () => listUserPayments(user.id) },
];

function expectNoPrivilegedRead() {
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.listUsers).not.toHaveBeenCalled();
  expect(mocks.getUserById).not.toHaveBeenCalled();
  expect(mocks.health).not.toHaveBeenCalled();
}

describe.each(readers)('$name authorization at the data boundary', ({ read }) => {
  it.each([
    { name: 'anonymous', identity: null, destination: '/login?error=admin_required' },
    { name: 'ordinary member', identity: member, destination: '/dashboard' },
    { name: 'identity without email', identity: { id: 'no-email-fixture' }, destination: '/dashboard' },
  ])('rejects $name before any privileged read', async ({ identity, destination }) => {
    mocks.getUser.mockResolvedValue({ data: { user: identity } });

    await expect(read()).rejects.toThrow('test-redirect:' + destination);

    expect(mocks.getUser).toHaveBeenCalledOnce();
    expectNoPrivilegedRead();
  });

  it('rejects a previously allowed operator after allowlist removal', async () => {
    vi.stubEnv('ADMIN_EMAILS', '');

    await expect(read()).rejects.toThrow('test-redirect:/dashboard');

    expectNoPrivilegedRead();
  });

  it('does not proceed when identity verification fails', async () => {
    const failure = new Error('Synthetic identity service failure');
    mocks.getUser.mockRejectedValue(failure);

    await expect(read()).rejects.toBe(failure);

    expectNoPrivilegedRead();
  });

  it('awaits verified operator identity before reading with service_role', async () => {
    let authorize!: (result: { data: { user: typeof operator } }) => void;
    mocks.getUser.mockReturnValue(new Promise<{ data: { user: typeof operator } }>((resolve) => {
      authorize = resolve;
    }));
    const pending = read();

    await vi.waitFor(() => expect(mocks.getUser).toHaveBeenCalledOnce());
    expectNoPrivilegedRead();

    authorize({ data: { user: operator } });
    await pending;
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.admin).toHaveBeenCalledOnce();
  });
});

describe('authorized admin reads retain their results', () => {
  it('returns the user and organization context', async () => {
    const result = await listAdminUsers();

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ userId: user.id, email: user.email, orgCount: 2, primaryOrgName: 'Company a' });
    expect(mocks.listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
  });

  it('returns details, notes and counts for both memberships', async () => {
    const result = await getAdminUserDetail(user.id);

    expect(mocks.getUserById).toHaveBeenCalledWith(user.id);
    expect(result?.memberships).toEqual([
      expect.objectContaining({ organizationId: 'tenant-a', invoiceCount: 2, expenseCount: 0 }),
      expect.objectContaining({ organizationId: 'tenant-b', invoiceCount: 1, expenseCount: 1 }),
    ]);
    expect(result?.recentAuditLogs[0].id).toBe('audit-fixture');
    expect(result?.notes[0].body).toBe('Synthetic operator note');
  });

  it('retains the metrics wrapper API and invokes the collector after authorization', async () => {
    const result = await getAdminOverviewMetrics();

    expect(result).toMatchObject({ totalUsers: 1, totalTenants: 2, invoicesIssued24h: 3, pendingJoinRequests: 1, ksefHealth: null });
    expect(mocks.health).toHaveBeenCalledWith('test');
  });

  it('returns payments with their refunds for an authorized operator', async () => {
    const result = await listUserPayments(user.id);

    expect(result).toEqual([expect.objectContaining({
      paymentId: 'payment-fixture', tenantId: 'tenant-a', amountCents: 12000, refundedAmountCents: 2500,
    })]);
    expect(mocks.from).toHaveBeenCalledWith('stripe_payments');
    expect(mocks.from).toHaveBeenCalledWith('stripe_refunds');
  });
});
