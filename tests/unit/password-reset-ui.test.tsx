import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), state: vi.fn(), action: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/auth/password-recovery', () => ({ getVerifiedPasswordRecoveryState: mocks.state }));
vi.mock('@/app/(auth)/reset-password/actions', () => ({ resetPasswordAction: mocks.action }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('redirect:' + url); } }));
import ResetPasswordPage from '@/app/(auth)/reset-password/page';
beforeEach(() => {
  vi.resetAllMocks(); mocks.client.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());
it.each(['unauthenticated', 'invalid', 'expired'])('does not render a password form for %s', async (status) => {
  mocks.state.mockResolvedValue({ status });
  const html = renderToStaticMarkup(await ResetPasswordPage());
  expect(html).not.toContain('name="new_password"'); expect(html).toContain('/forgot-password');
  expect(mocks.action).not.toHaveBeenCalled();
});
it('renders bounded new-password fields without asking for the forgotten password', async () => {
  mocks.state.mockResolvedValue({ status: 'verified', user: { factors: [] } });
  const html = renderToStaticMarkup(await ResetPasswordPage());
  expect(html).toContain('name="new_password"'); expect(html).toContain('name="confirm_password"');
  expect(html).toContain('maxLength="128"'); expect(html).toContain('autoComplete="new-password"');
  expect(html).not.toContain('current_password'); expect(mocks.action).not.toHaveBeenCalled();
});
it('returns a TOTP challenge to this reset route', async () => {
  mocks.state.mockResolvedValue({ status: 'challenge_required', user: { factors: [{ factor_type: 'totp', status: 'verified' }] } });
  await expect(ResetPasswordPage()).rejects.toThrow('redirect:/login/two-factor?redirect=%2Freset-password');
});
it('does not permit an unsupported second factor to downgrade into password reset', async () => {
  mocks.state.mockResolvedValue({ status: 'challenge_required', user: { factors: [{ factor_type: 'phone', status: 'verified' }] } });
  const html = renderToStaticMarkup(await ResetPasswordPage());
  expect(html).not.toContain('name="new_password"'); expect(html).toContain('drugiego składnika');
});
