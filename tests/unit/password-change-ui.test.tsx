import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
const actions = vi.hoisted(() => ({ change: vi.fn(), send: vi.fn() }));
vi.mock('@/app/(dashboard)/settings/security/actions', () => ({
  changePasswordAction: actions.change, requestPasswordChangeNonceAction: actions.send,
}));
import { PasswordChangeCard } from '@/app/(dashboard)/settings/security/_components/password-change-card';
afterEach(() => vi.clearAllMocks());

it('initial render requires passwords and never requests a code or reports success', () => {
  const markup = renderToStaticMarkup(<PasswordChangeCard />);
  expect(markup).toContain('name="current_password"');
  expect(markup).toContain('autoComplete="current-password"');
  expect(markup).toContain('name="new_password"');
  expect(markup).toContain('autoComplete="new-password"');
  expect(markup).not.toContain('name="nonce"');
  expect(markup).not.toContain('Kod został wysłany');
  expect(markup).not.toContain('Hasło zmienione.');
  expect(actions.send).not.toHaveBeenCalled();
  expect(actions.change).not.toHaveBeenCalled();
});
