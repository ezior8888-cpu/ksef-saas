import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ state: vi.fn(), client: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/auth/verified-mfa', () => ({ getVerifiedMfaState: mocks.state }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
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


it.each([
  { error: 'recovery_unavailable', message: 'Kod nie został zużyty.' },
  { error: 'verification_unavailable', message: 'Nie możemy teraz sprawdzić kodu.' },
  { error: 'rate_limited', message: 'Zbyt wiele prób.' },
])('explains $error and retains the validated return destination', async ({ error, message }) => {
  mocks.state.mockResolvedValue({ status: 'challenge_required', user: { id: 'fixture' } });
  const markup = renderToStaticMarkup(await TwoFactorChallengePage({
    searchParams: Promise.resolve({ error, redirect: '/admin' }),
  }));
  expect(markup).toContain('role="alert"');
  expect(markup).toContain(message);
  expect(markup).toContain('name="redirect" value="/admin"');
  expect(markup).toContain('href="mailto:support@faktflow.pl"');
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it('offers only a six-digit TOTP code and explains the recovery limitation', async () => {
  mocks.state.mockResolvedValue({ status: 'challenge_required', user: { id: 'fixture' } });
  const markup = renderToStaticMarkup(await TwoFactorChallengePage({ searchParams: Promise.resolve({}) }));
  expect(markup).toContain('Wpisz 6-cyfrowy kod z aplikacji TOTP.');
  expect(markup).toContain('pattern="[0-9]{6}"');
  expect(markup).toContain('maxLength="6"');
  expect(markup).toContain('Samodzielne odzyskiwanie dostępu');
  expect(markup).toContain('niedostępne.');
  expect(markup).not.toContain('albo jeden z kodów ratunkowych');
  expect(markup).not.toContain('lub kod ratunkowy');
});
