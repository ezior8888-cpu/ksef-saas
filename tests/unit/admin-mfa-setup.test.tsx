import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({ state: vi.fn(), create: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/auth/verified-mfa', () => ({ getVerifiedMfaState: mocks.state }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.create, createAdminClient: mocks.admin }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error('redirect:' + path); } }));
vi.mock('@/app/(dashboard)/settings/security/_components/two-factor-card', () => ({
  TwoFactorCard: () => <div>Testowy formularz TOTP</div>,
}));
import AdminMfaSetupPage from '@/app/(auth)/login/two-factor/setup/page';
const user = { id: 'operator', email: 'operator@example.test', email_confirmed_at: '2026-09-14T00:00:00Z' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_EMAILS', user.email);
  mocks.create.mockResolvedValue({});
  mocks.state.mockResolvedValue({ status: 'enrollment_required', user });
});
afterEach(() => vi.unstubAllEnvs());
it('allows initial admin enrollment without creating or querying a tenant', async () => {
  const html = renderToStaticMarkup(await AdminMfaSetupPage());
  expect(html).toContain('Testowy formularz TOTP');
  expect(html).toContain('Nie musisz w tym celu zakładać firmy');
  expect(mocks.admin).not.toHaveBeenCalled();
});
it.each([
  { status: 'unauthenticated', target: '/login' },
  { status: 'challenge_required', target: '/login/two-factor?redirect=%2Fadmin' },
  { status: 'verified', target: '/admin' },
])('routes $status to $target', async ({ status, target }) => {
  mocks.state.mockResolvedValue({ status, user });
  await expect(AdminMfaSetupPage()).rejects.toThrow('redirect:' + target);
});
it.each([
  { ...user, email_confirmed_at: undefined },
  { ...user, email: 'member@example.test' },
])('denies an ineligible operator', async (ineligible) => {
  mocks.state.mockResolvedValue({ status: 'enrollment_required', user: ineligible });
  await expect(AdminMfaSetupPage()).rejects.toThrow('redirect:/dashboard');
  expect(mocks.admin).not.toHaveBeenCalled();
});
it('does not turn a verification failure into an enrollment form', async () => {
  mocks.state.mockRejectedValue(new Error('invalid claims'));
  await expect(AdminMfaSetupPage()).rejects.toThrow('invalid claims');
});
