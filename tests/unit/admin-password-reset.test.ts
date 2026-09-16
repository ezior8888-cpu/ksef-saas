import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  admin: vi.fn(),
  getUserById: vi.fn(),
  generateLink: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/auth/admin-guard', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { sendPasswordResetAction } from '@/app/admin/users/actions';
import { UserActions } from '@/app/admin/users/[userId]/_components/user-actions';

const targetId = '00000000-0000-4000-8000-000000000123';
const operator = { userId: 'synthetic-operator', email: 'operator@example.test' };
const unavailable = {
  success: false,
  error: 'Resetowanie hasła z panelu administratora jest niedostępne. Użytkownik może sam rozpocząć reset na stronie /forgot-password.',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue(operator);
  mocks.admin.mockReturnValue({
    auth: {
      admin: { getUserById: mocks.getUserById, generateLink: mocks.generateLink },
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  });
  mocks.getUserById.mockResolvedValue({
    data: { user: { id: targetId, email: 'private-recipient@example.test' } }, error: null,
  });
  mocks.generateLink.mockResolvedValue({
    data: { properties: { action_link: 'https://auth.example.test/private-recovery-link' } }, error: null,
  });
  mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});

function expectNoEffects() {
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.getUserById).not.toHaveBeenCalled();
  expect(mocks.generateLink).not.toHaveBeenCalled();
  expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
}

describe('operator-requested password reset remains explicitly unavailable', () => {
  it('does not generate a bearer link, request mail or record a false success', async () => {
    expect(await sendPasswordResetAction(targetId)).toEqual(unavailable);
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expectNoEffects();
  });

  it.each(['unauthenticated', 'not an operator', 'MFA challenge required', 'Auth unavailable'])(
    'preserves the admin guard when %s', async (reason) => {
      mocks.requireAdmin.mockRejectedValue(new Error(reason));
      await expect(sendPasswordResetAction(targetId)).rejects.toThrow(reason);
      expectNoEffects();
    },
  );

  it('awaits admin authorization before returning even an unavailable operation', async () => {
    let authorize!: (value: typeof operator) => void;
    mocks.requireAdmin.mockReturnValue(new Promise<typeof operator>((resolve) => { authorize = resolve; }));
    const finished = vi.fn();
    const pending = sendPasswordResetAction(targetId).then(finished);
    await Promise.resolve();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(finished).not.toHaveBeenCalled();
    expectNoEffects();
    authorize(operator);
    await pending;
    expect(finished).toHaveBeenCalledWith(unavailable);
    expectNoEffects();
  });

  it.each([targetId, '', 'private-recipient@example.test', null, undefined, 42])(
    'never leaks user, email or recovery-link data for input %#', async (input) => {
      const result = await sendPasswordResetAction(input as string);
      expect(result).toEqual(unavailable);
      expect(JSON.stringify(result)).not.toContain('private-recipient');
      expect(JSON.stringify(result)).not.toContain('private-recovery-link');
      expectNoEffects();
    },
  );

  it.each([true, false])('shows an unavailable control and the recipient recovery path (suspended: %s)', (isSuspended) => {
    const html = renderToStaticMarkup(createElement(UserActions, {
      userId: targetId, email: 'private-recipient@example.test', isSuspended,
    }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="admin-password-reset-status"/);
    expect(html).toContain('Reset hasła niedostępny');
    expect(html).toContain('Użytkownik może sam rozpocząć reset na stronie /forgot-password.');
    expect(html).not.toContain('Wyślij reset hasła');
    expect(html).not.toContain('private-recipient@example.test');
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expectNoEffects();
  });
});
