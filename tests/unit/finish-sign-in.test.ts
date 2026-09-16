import { beforeEach, expect, it, vi } from 'vitest';
import { finishSignInFromFragment } from '@/lib/auth/finish-sign-in';
const clear = vi.fn();
const setSession = vi.fn();
const fragment = '#access_token=fixture.access.token&refresh_token=fixture-refresh';
const valid = { error: null, data: { user: { id: 'fixture-user' }, session: { user: { id: 'fixture-user' } } } };
function run(hash = fragment, destination: string | null = '/invoices?status=paid') {
  return finishSignInFromFragment({ fragment: hash, destination, clearFragment: clear, setSession });
}
beforeEach(() => {
  vi.resetAllMocks();
  setSession.mockResolvedValue(valid);
});
it('clears URL before calling Auth and returns no tokens', async () => {
  const result = await run();
  expect(clear).toHaveBeenCalledOnce();
  expect(setSession).toHaveBeenCalledExactlyOnceWith({ access_token: 'fixture.access.token', refresh_token: 'fixture-refresh' });
  expect(clear.mock.invocationCallOrder[0]).toBeLessThan(setSession.mock.invocationCallOrder[0]);
  expect(result).toEqual({ ok: true, destination: '/invoices?status=paid' });
});
it('never calls Auth if URL cleanup is unavailable', async () => {
  clear.mockImplementation(() => { throw new Error('synthetic-private-detail'); });
  expect(await run()).toEqual({ ok: false, error: 'verification_unavailable' });
  expect(setSession).not.toHaveBeenCalled();
});
it.each(['#error=fixture', '#error_description=synthetic-private-detail', fragment + '&error_description='])('clears an Auth error fragment and never reflects its contents: %s', async (hash) => {
  expect(await run(hash)).toEqual({ ok: false, error: 'invalid_link' });
  expect(clear).toHaveBeenCalledOnce();
  expect(setSession).not.toHaveBeenCalled();
});
it.each(['', '#access_token=fixture', '#refresh_token=fixture', '#' + 'x'.repeat(32768)])('clears incomplete or oversized fragments before denying them', async (hash) => {
  expect(await run(hash)).toEqual({ ok: false, error: 'missing_code' });
  expect(clear).toHaveBeenCalledOnce();
  expect(setSession).not.toHaveBeenCalled();
});
it.each(['&access_token=other', '&refresh_token=other'])('rejects duplicate token fields %s', async (extra) => {
  expect(await run(fragment + extra)).toEqual({ ok: false, error: 'invalid_link' });
  expect(setSession).not.toHaveBeenCalled();
});
it.each([
  { error: { message: 'synthetic-private-detail' }, data: { user: null, session: null } },
  { error: null, data: { user: { id: 'fixture-user' }, session: null } },
  { error: null, data: { user: { id: 'fixture-user' }, session: { user: { id: 'other-user' } } } },
])('rejects failed or inconsistent Auth responses without raw errors', async (response) => {
  setSession.mockResolvedValue(response);
  expect(await run()).toEqual({ ok: false, error: 'invalid_link' });
  expect(clear).toHaveBeenCalledOnce();
});
it('handles Auth transport failures without leaking token/error text', async () => {
  setSession.mockRejectedValue(new Error('synthetic-private-detail'));
  expect(await run()).toEqual({ ok: false, error: 'verification_unavailable' });
  expect(clear).toHaveBeenCalledOnce();
});
it.each(['javascript:fixture', '//outside.example.test', '/\t/outside.example.test'])('sanitizes browser-only destination %s', async (destination) => {
  expect(await run(fragment, destination)).toEqual({ ok: true, destination: '/dashboard' });
});
it('does not convert fragment recovery flags into privileges or change the destination', async () => {
  expect(await run(fragment + '&type=recovery&aal=aal2&next=//outside.example.test', '/reset-password')).toEqual({ ok: true, destination: '/reset-password' });
  expect(setSession).toHaveBeenCalledExactlyOnceWith({ access_token: 'fixture.access.token', refresh_token: 'fixture-refresh' });
});
