import { beforeEach, expect, it, vi } from 'vitest';
import { finishSignInFromFragment } from '@/lib/auth/finish-sign-in';

const clear = vi.fn();
const fragment = '#access_token=fixture.access.token&refresh_token=fixture-refresh';
function run(hash = fragment) {
  return finishSignInFromFragment({ fragment: hash, clearFragment: clear });
}
beforeEach(() => vi.resetAllMocks());

it.each([
  fragment,
  '#access_token=fixture',
  '#refresh_token=fixture',
  fragment + '&access_token=other&refresh_token=other',
  fragment + '&type=recovery&aal=aal2&next=//outside.example.test',
])('clears and rejects every implicit token link without returning token text', async (hash) => {
  expect(await run(hash)).toEqual({ ok: false, error: 'legacy_link' });
  expect(clear).toHaveBeenCalledOnce();
});
it('reports a controlled failure if URL cleanup is unavailable', async () => {
  clear.mockImplementation(() => { throw new Error('synthetic-private-detail'); });
  expect(await run()).toEqual({ ok: false, error: 'verification_unavailable' });
});
it.each(['#error=fixture', '#error_description=synthetic-private-detail', fragment + '&error_description='])('clears an Auth error without reflecting its contents: %s', async (hash) => {
  expect(await run(hash)).toEqual({ ok: false, error: 'invalid_link' });
  expect(clear).toHaveBeenCalledOnce();
});
it.each(['', '#code=fixture', '#type=recovery', '#' + 'x'.repeat(32768)])('clears missing or oversized fragments before denying them', async (hash) => {
  expect(await run(hash)).toEqual({ ok: false, error: 'missing_code' });
  expect(clear).toHaveBeenCalledOnce();
});
