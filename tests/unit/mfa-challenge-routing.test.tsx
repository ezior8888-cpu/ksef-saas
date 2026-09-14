import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ state: vi.fn(), client: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/auth/verified-mfa', () => ({ getVerifiedMfaState: mocks.state }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/components/ui/button', () => ({ Button: () => null }));
vi.mock('@/components/ui/input', () => ({ Input: () => null }));
vi.mock('@/app/(auth)/login/two-factor/actions', () => ({ verifyMfaChallengeAction: vi.fn() }));

import TwoFactorChallengePage from '@/app/(auth)/login/two-factor/page';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({});
  mocks.redirect.mockImplementation((path: string) => { throw new Error('redirect:' + path); });
});
it.each([
  { status: 'unauthenticated', target: '/login' },
  { status: 'enrollment_required', target: '/settings/security' },
  { status: 'verified', target: '/admin' },
])('routes a $status session correctly', async ({ status, target }) => {
  mocks.state.mockResolvedValue({ status, user: { id: 'fixture' } });
  await expect(TwoFactorChallengePage({ searchParams: Promise.resolve({ redirect: '/admin' }) }))
    .rejects.toThrow('redirect:' + target);
});
it('rejects an external return destination', async () => {
  mocks.state.mockResolvedValue({ status: 'verified', user: { id: 'fixture' } });
  await expect(TwoFactorChallengePage({ searchParams: Promise.resolve({ redirect: 'https://outside.example.test' }) }))
    .rejects.toThrow('redirect:/dashboard');
});
it('shows the challenge only after authenticated session verification', async () => {
  mocks.state.mockResolvedValue({ status: 'challenge_required', user: { id: 'fixture' } });
  const page = await TwoFactorChallengePage({ searchParams: Promise.resolve({ redirect: '/admin' }) });
  expect(page).toBeTruthy();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it('does not send failed verification back into an authentication redirect loop', async () => {
  mocks.state.mockRejectedValue(new Error('verification-unavailable'));
  await expect(TwoFactorChallengePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('verification-unavailable');
  expect(mocks.redirect).not.toHaveBeenCalled();
});
