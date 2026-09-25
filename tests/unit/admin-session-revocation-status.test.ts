import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  admin: vi.fn(),
  updateUserById: vi.fn(),
  signOut: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@/lib/auth/admin-guard', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

import { forceLogoutAction, suspendUserAction } from '@/app/admin/users/actions';

const TARGET = '00000000-0000-4000-8000-000000000123';
const operator = { userId: 'synthetic-operator', email: 'operator@example.test' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue(operator);
  mocks.admin.mockReturnValue({
    auth: { admin: { updateUserById: mocks.updateUserById, signOut: mocks.signOut } },
  });
  mocks.updateUserById.mockResolvedValue({ data: { user: { id: TARGET } }, error: null });
  mocks.signOut.mockImplementation(() => { throw new Error('Unexpected auth signOut call'); });
  mocks.audit.mockResolvedValue(undefined);
});

function expectNoEffects() {
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.updateUserById).not.toHaveBeenCalled();
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
}

const guardedActions = [
  { name: 'force logout', action: forceLogoutAction },
  { name: 'suspension', action: suspendUserAction },
];

describe('admin session revocation status', () => {
  it.each(guardedActions)('denies $name before every privileged operation', async ({ action }) => {
    mocks.requireAdmin.mockRejectedValue(new Error('synthetic authorization denied'));

    await expect(action(TARGET)).rejects.toThrow('synthetic authorization denied');

    expectNoEffects();
  });

  it.each(guardedActions)('waits for authorization before $name', async ({ action }) => {
    let authorize!: (value: typeof operator) => void;
    mocks.requireAdmin.mockReturnValue(new Promise<typeof operator>((resolve) => { authorize = resolve; }));

    const pending = action(TARGET);
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expectNoEffects();

    authorize(operator);
    await pending;
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('explicitly refuses force logout without an auth request or success audit', async () => {
    const result = await forceLogoutAction(TARGET);

    expect(result).toEqual({
      success: false,
      error: 'Wymuszenie wylogowania jest obecnie niedostępne. Skontaktuj się z operatorem.',
    });
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expectNoEffects();
  });

  it('reports a failed ban without claiming suspension or session revocation', async () => {
    mocks.updateUserById.mockResolvedValue({ data: { user: null }, error: { message: 'synthetic ban failure' } });

    expect(await suspendUserAction(TARGET)).toEqual({ success: false, error: 'synthetic ban failure' });

    expect(mocks.updateUserById).toHaveBeenCalledExactlyOnceWith(TARGET, { ban_duration: '876000h' });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it('confirms a successful ban while explicitly leaving existing session revocation unverified', async () => {
    expect(await suspendUserAction(TARGET)).toEqual({
      success: true,
      message: 'Konto zawieszone. Odwołanie istniejących sesji nie zostało potwierdzone.',
    });

    expect(mocks.updateUserById).toHaveBeenCalledExactlyOnceWith(TARGET, { ban_duration: '876000h' });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({
      action: 'admin.user.suspended',
      tenantId: null,
      userId: operator.userId,
      entityType: 'user',
      entityId: TARGET,
      metadata: { adminEmail: operator.email, action: 'ban', sessionRevocation: 'unverified' },
    });
    expect(mocks.revalidate.mock.calls).toEqual([[`/admin/users/${TARGET}`], ['/admin/users']]);
  });

  it('retains the self-suspension guard before creating an admin client', async () => {
    expect(await suspendUserAction(operator.userId)).toMatchObject({ success: false });

    expectNoEffects();
  });
});
