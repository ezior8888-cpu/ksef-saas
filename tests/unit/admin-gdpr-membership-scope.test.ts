import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  admin: vi.fn(),
  deleteUser: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@/lib/auth/admin-guard', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

import { deleteUserGdprAction } from '@/app/admin/users/actions';

const USER = 'synthetic-target-user';
const OTHER_USER = 'synthetic-other-user';
const OPERATOR = 'synthetic-admin';
const activeOrg = 'synthetic-active-org';
const formerOrg = 'synthetic-former-org';
const memberOrg = 'synthetic-member-org';
const foreignOrg = 'synthetic-foreign-org';

interface Membership {
  user_id: string;
  organization_id: string;
  role: string;
  status: string;
  revoked_at: string | null;
}

interface Tenant {
  id: string;
  is_active: boolean;
  deleted_at: string | null;
  hard_delete_at: string | null;
}

type Table = 'memberships' | 'tenants';
type Filters = Map<string, string | string[]>;
type QueryResult = { data: Membership[] | null; error: { message: string } | null };

function fixtures(): Membership[] {
  return [
    { user_id: USER, organization_id: activeOrg, role: 'owner', status: 'active', revoked_at: null },
    // Migration 00038 revokes status without clearing the historical owner role.
    { user_id: USER, organization_id: formerOrg, role: 'owner', status: 'revoked', revoked_at: '2026-09-01T00:00:00Z' },
    { user_id: USER, organization_id: memberOrg, role: 'member', status: 'active', revoked_at: null },
    { user_id: OTHER_USER, organization_id: foreignOrg, role: 'owner', status: 'active', revoked_at: null },
  ];
}

/** Applies query filters to synthetic rows, so omitted scope filters change outcomes. */
function database(memberships: Membership[] = fixtures()) {
  const state = {
    memberships,
    tenants: [activeOrg, formerOrg, memberOrg, foreignOrg].map((id): Tenant => ({
      id, is_active: true, deleted_at: null, hard_delete_at: null,
    })),
    writeAttempts: [] as Table[],
    readFailure: 'none' as 'none' | 'error' | 'missing',
    updateFailure: null as Table | null,
  };
  const matches = (row: object, filters: Filters) => [...filters].every(([column, value]) =>
    Array.isArray(value) ? value.includes(Reflect.get(row, column)) : Reflect.get(row, column) === value);

  const from = vi.fn((table: Table) => {
    const filters: Filters = new Map();
    let patch: Record<string, unknown> | null = null;
    const execute = async (): Promise<QueryResult> => {
      if (patch === null) {
        expect(table).toBe('memberships');
        const selected = state.memberships.filter((row) => matches(row, filters));
        if (state.readFailure === 'error') {
          // Even partial data accompanying an error must never authorize writes.
          return { data: selected, error: { message: 'synthetic membership read failure' } };
        }
        return { data: state.readFailure === 'missing' ? null : selected, error: null };
      }

      state.writeAttempts.push(table);
      if (state.updateFailure === table) {
        return { data: null, error: { message: 'synthetic update failure' } };
      }
      const rows = table === 'memberships' ? state.memberships : state.tenants;
      for (const row of rows) {
        if (matches(row, filters)) Object.assign(row, patch);
      }
      return { data: null, error: null };
    };
    const then: Promise<QueryResult>['then'] = (onfulfilled, onrejected) =>
      execute().then(onfulfilled, onrejected);
    const query = {
      select: () => query,
      eq: (column: string, value: string) => { filters.set(column, value); return query; },
      in: (column: string, value: string[]) => { filters.set(column, value); return query; },
      update: (value: Record<string, unknown>) => { patch = value; return query; },
      then,
    };
    return query;
  });

  mocks.admin.mockReturnValue({ from, auth: { admin: { deleteUser: mocks.deleteUser } } });
  return state;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: OPERATOR, email: 'operator@example.test' });
  mocks.deleteUser.mockResolvedValue({ error: null });
  mocks.audit.mockResolvedValue(undefined);
});

function expectNoSuccessEffects() {
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
}

describe('admin GDPR deletion membership scope', () => {
  it('deactivates only the target user active owner organization', async () => {
    const db = database();

    expect(await deleteUserGdprAction(USER, 'DELETE')).toMatchObject({ success: true });

    expect(db.tenants.filter((row) => !row.is_active).map((row) => row.id)).toEqual([activeOrg]);
    for (const id of [formerOrg, memberOrg, foreignOrg]) {
      expect(db.tenants.find((row) => row.id === id)).toMatchObject({
        is_active: true, deleted_at: null, hard_delete_at: null,
      });
    }
    expect(db.memberships.filter((row) => row.user_id === USER).every((row) => row.status === 'revoked')).toBe(true);
    expect(db.memberships.find((row) => row.user_id === OTHER_USER)).toMatchObject({
      status: 'active', revoked_at: null,
    });
    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith(USER);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin.user.deleted',
      entityId: USER,
      metadata: expect.objectContaining({ ownedOrgsSoftDeleted: 1 }),
    }));
  });

  it('can delete a former owner account without deactivating its former organization', async () => {
    const db = database(fixtures().filter((row) => row.organization_id === formerOrg));

    expect(await deleteUserGdprAction(USER, 'DELETE')).toMatchObject({ success: true });

    expect(db.writeAttempts).toEqual(['memberships']);
    expect(db.tenants.every((row) => row.is_active && row.deleted_at === null)).toBe(true);
    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith(USER);
  });

  it('does not borrow another user active ownership when the target has no owner role', async () => {
    const db = database(fixtures().filter((row) => row.user_id === OTHER_USER || row.role === 'member'));

    expect(await deleteUserGdprAction(USER, 'DELETE')).toMatchObject({ success: true });

    expect(db.writeAttempts).toEqual(['memberships']);
    expect(db.tenants.every((row) => row.is_active)).toBe(true);
    expect(db.memberships.find((row) => row.user_id === OTHER_USER)?.status).toBe('active');
    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith(USER);
  });

  it.each(['error', 'missing'] as const)('stops before every write on a %s membership read', async (failure) => {
    const db = database();
    db.readFailure = failure;
    const before = structuredClone({ memberships: db.memberships, tenants: db.tenants });

    expect(await deleteUserGdprAction(USER, 'DELETE')).toMatchObject({ success: false });

    expect(db.writeAttempts).toEqual([]);
    expect(db.memberships).toEqual(before.memberships);
    expect(db.tenants).toEqual(before.tenants);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expectNoSuccessEffects();
  });

  it('stops before revocation and auth deletion if the organization update fails', async () => {
    const db = database();
    db.updateFailure = 'tenants';

    expect(await deleteUserGdprAction(USER, 'DELETE')).toMatchObject({ success: false });

    expect(db.writeAttempts).toEqual(['tenants']);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(db.tenants.every((row) => row.is_active)).toBe(true);
    expectNoSuccessEffects();
  });

  it('does not delete auth or claim success when membership revocation fails', async () => {
    const db = database();
    db.updateFailure = 'memberships';

    expect(await deleteUserGdprAction(USER, 'DELETE')).toMatchObject({ success: false });

    expect(db.writeAttempts).toEqual(['tenants', 'memberships']);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    // This existing multi-step operation is not a transaction: no rollback is claimed.
    expect(db.tenants.find((row) => row.id === activeOrg)?.is_active).toBe(false);
    expectNoSuccessEffects();
  });

  it('does not log a successful deletion when the auth service rejects it', async () => {
    database();
    mocks.deleteUser.mockResolvedValue({ error: { message: 'synthetic auth delete failure' } });

    expect(await deleteUserGdprAction(USER, 'DELETE')).toMatchObject({ success: false });

    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith(USER);
    expectNoSuccessEffects();
  });

  it('retains the confirmation and self-deletion guards before creating the admin client', async () => {
    expect(await deleteUserGdprAction(USER, 'delete')).toMatchObject({ success: false });
    expect(await deleteUserGdprAction(OPERATOR, 'DELETE')).toMatchObject({ success: false });

    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expectNoSuccessEffects();
  });

  it('awaits administrator authorization before allowing any privileged operation', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('synthetic unauthorized'));

    await expect(deleteUserGdprAction(USER, 'DELETE')).rejects.toThrow('synthetic unauthorized');

    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expectNoSuccessEffects();
  });
});
