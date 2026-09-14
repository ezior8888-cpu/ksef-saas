import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  listUsers: vi.fn(),
  backup: vi.fn(),
  floProposals: vi.fn(),
  floCost: vi.fn(),
  floAccuracy: vi.fn(),
  floRollout: vi.fn(),
}));

// The central guard has its own identity/MFA tests. Here a denied or pending
// decision must prevent every operational reader and page from starting work.
vi.mock('@/lib/auth/admin-guard', () => ({ requireAdmin: mocks.guard }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/backup/backup-log', () => ({ getLastBackup: mocks.backup }));
vi.mock('@/lib/flo/metrics', () => ({
  COST_HARD_LIMIT_PLN: 3,
  COST_TARGET_PLN: 0.95,
  readProposalMetrics: mocks.floProposals,
  readCostMetrics: mocks.floCost,
}));
vi.mock('@/lib/flo/shadow', () => ({
  accuracyByKind: mocks.floAccuracy,
  isReadyToReveal: vi.fn(),
}));
vi.mock('@/lib/flo/rollout', () => ({
  readRollout: mocks.floRollout,
  ROLLOUT_ORDER: [{ kind: 'payment.chase' }],
}));
// Client-only controls are irrelevant to data authorization and can import
// their Server Actions, so keep those dependencies outside this unit test.
vi.mock('@/app/admin/flags/_components/flag-toggle', () => ({ FlagToggle: vi.fn() }));
vi.mock('@/app/admin/system/_components/backup-status-card', () => ({ BackupStatusCard: vi.fn() }));
vi.mock('@/app/admin/system/_components/health-timeline', () => ({ HealthTimeline: vi.fn() }));

import { listTenantsWithFlags } from '@/lib/admin/flags';
import {
  getInactiveUsers,
  getPendingJoinRequests,
  getRecentlyFailedInvoices,
  getRecentSignups,
  getSupportConversations,
} from '@/lib/admin/support';
import {
  getDbStats,
  getInngestJobStats,
  getKsefHealthHistory,
  getOfflineQueueSnapshot,
} from '@/lib/admin/system';
import { getBackupOverview } from '@/lib/admin/backups';
import AdminFlagsPage from '@/app/admin/flags/page';
import AdminSupportPage from '@/app/admin/support/page';
import AdminSystemPage from '@/app/admin/system/page';
import AdminFloPage from '@/app/admin/flo/page';

const operator = { userId: 'operator-fixture', email: 'operator@example.test' };
const denied = new Error('test-admin-authorization-denied');

function emptyQuery() {
  const result = { data: [], count: 0, error: null };
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => chain),
    or: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    then: <T>(resolve: (value: typeof result) => T | PromiseLike<T>) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue(operator);
  mocks.from.mockImplementation(emptyQuery);
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === 'admin_database_size' ? 1024 : [],
    error: null,
  }));
  mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mocks.admin.mockReturnValue({
    from: mocks.from,
    rpc: mocks.rpc,
    auth: { admin: { listUsers: mocks.listUsers } },
  });
  mocks.backup.mockResolvedValue(null);
});

function expectNoPrivilegedWork() {
  for (const mock of [
    mocks.admin, mocks.from, mocks.rpc, mocks.listUsers, mocks.backup,
    mocks.floProposals, mocks.floCost, mocks.floAccuracy, mocks.floRollout,
  ]) {
    expect(mock).not.toHaveBeenCalled();
  }
}

const readers = [
  { name: 'tenant flags', read: () => listTenantsWithFlags(), expected: { items: [], total: 0, page: 0, pageSize: 50 } },
  { name: 'recent signups', read: () => getRecentSignups(), expected: [] },
  { name: 'inactive users', read: () => getInactiveUsers(), expected: [] },
  { name: 'failed invoices', read: () => getRecentlyFailedInvoices(), expected: [] },
  { name: 'join requests', read: () => getPendingJoinRequests(), expected: [] },
  { name: 'support conversations', read: () => getSupportConversations(), expected: [] },
  { name: 'KSeF health history', read: () => getKsefHealthHistory('test'), expected: [] },
  { name: 'job statistics', read: () => getInngestJobStats(), expected: [] },
  { name: 'database statistics', read: () => getDbStats(), expected: { totalDatabaseBytes: 1024, tables: [] } },
  { name: 'offline queue', read: () => getOfflineQueueSnapshot(), expected: { pending: 0, failed: 0, oldestDeadline: null } },
  { name: 'backup overview', read: () => getBackupOverview(), expected: { lastDaily: null, lastWeekly: null, hoursSinceLastSuccess: null, hasRecentFailure: false } },
];

describe.each(readers)('$name authorization at the data boundary', ({ read, expected, name }) => {
  it('propagates a rejected admin/MFA decision before privileged work', async () => {
    mocks.guard.mockRejectedValue(denied);

    await expect(read()).rejects.toBe(denied);

    expect(mocks.guard).toHaveBeenCalledOnce();
    expectNoPrivilegedWork();
  });

  it('waits for authorization before opening an administrative client or API', async () => {
    let authorize!: (context: typeof operator) => void;
    mocks.guard.mockReturnValue(new Promise<typeof operator>((resolve) => {
      authorize = resolve;
    }));

    const pending = read();
    expect(mocks.guard).toHaveBeenCalledOnce();
    await Promise.resolve();
    expectNoPrivilegedWork();

    authorize(operator);
    await expect(pending).resolves.toEqual(expected);
    if (name === 'backup overview') {
      expect(mocks.backup).toHaveBeenCalledWith('daily');
      expect(mocks.backup).toHaveBeenCalledWith('weekly');
    } else {
      expect(mocks.admin).toHaveBeenCalledOnce();
    }
  });
});

const pages = [
  { name: 'feature flags', render: () => AdminFlagsPage({ searchParams: Promise.resolve({}) }) },
  { name: 'support with data fallbacks', render: () => AdminSupportPage() },
  { name: 'system with data fallbacks', render: () => AdminSystemPage() },
  { name: 'Flo with shared engine readers', render: () => AdminFloPage() },
];

describe.each(pages)('$name page authorization', ({ render }) => {
  it('propagates denial before rendering or starting its readers', async () => {
    mocks.guard.mockRejectedValue(denied);

    await expect(render()).rejects.toBe(denied);

    expect(mocks.guard).toHaveBeenCalledOnce();
    expectNoPrivilegedWork();
  });

  it('does not run readers while the page decision is pending', async () => {
    let reject!: (reason: Error) => void;
    mocks.guard.mockReturnValue(new Promise<never>((_, rejectDecision) => {
      reject = rejectDecision;
    }));

    const pending = render();
    const assertion = expect(pending).rejects.toBe(denied);
    await Promise.resolve();
    expect(mocks.guard).toHaveBeenCalledOnce();
    expectNoPrivilegedWork();

    reject(denied);
    await assertion;
    expectNoPrivilegedWork();
  });
});
