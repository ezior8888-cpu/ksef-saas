import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  effect: vi.fn(), state: vi.fn(), replace: vi.fn(), client: vi.fn(), setSession: vi.fn(),
  clear: vi.fn(), next: '/invoices?status=paid',
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => (() => void)) => mocks.effect(effect),
  useState: () => [null, mocks.state],
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams({ next: mocks.next }),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.client }));
import FinishPage from '@/app/auth/finish/page';
const valid = { error: null, data: { user: { id: 'fixture-user' }, session: { user: { id: 'fixture-user' } } } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.next = '/invoices?status=paid';
  const location = { hash: '#access_token=fixture-access&refresh_token=fixture-refresh', pathname: '/auth/finish' };
  mocks.clear.mockImplementation(() => { location.hash = ''; });
  vi.stubGlobal('window', { location, history: { replaceState: mocks.clear } });
  mocks.client.mockReturnValue({ auth: { setSession: mocks.setSession } });
  mocks.setSession.mockResolvedValue(valid);
});
afterEach(() => vi.unstubAllGlobals());
function effect() {
  renderToStaticMarkup(<FinishPage />);
  expect(mocks.effect).toHaveBeenCalledOnce();
  return mocks.effect.mock.calls[0][0] as () => (() => void);
}
it('reuses in-flight completion across StrictMode effect replay', async () => {
  let resolve!: (response: typeof valid) => void;
  mocks.setSession.mockReturnValue(new Promise((done) => { resolve = done; }));
  const runEffect = effect();
  const cleanupFirst = runEffect();
  expect(window.location.hash).toBe('');
  expect(mocks.clear).toHaveBeenCalledExactlyOnceWith(null, '', '/auth/finish');
  expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(mocks.client.mock.invocationCallOrder[0]);
  cleanupFirst();
  const cleanupSecond = runEffect();
  expect(mocks.setSession).toHaveBeenCalledOnce();
  resolve(valid);
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/invoices?status=paid'));
  expect(mocks.state).not.toHaveBeenCalled();
  cleanupSecond();
});
it('does not navigate or update UI after unmount', async () => {
  let resolve!: (response: typeof valid) => void;
  mocks.setSession.mockReturnValue(new Promise((done) => { resolve = done; }));
  const cleanup = effect()();
  cleanup();
  resolve(valid);
  await Promise.resolve(); await Promise.resolve();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.state).not.toHaveBeenCalled();
});
it('clears fragment errors before showing a controlled message', async () => {
  window.location.hash = '#error_description=synthetic-private-detail&access_token=fixture-access';
  effect()();
  await vi.waitFor(() => expect(mocks.state).toHaveBeenCalledOnce());
  expect(window.location.hash).toBe('');
  expect(mocks.state.mock.calls[0][0]).not.toContain('synthetic-private-detail');
  expect(mocks.client).not.toHaveBeenCalled();
});
it('sanitizes direct finish-page navigation independently of callback', async () => {
  mocks.next = 'javascript:fixture';
  effect()();
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/dashboard'));
});
it('shows a controlled failure when client creation throws after cleanup', async () => {
  mocks.client.mockImplementation(() => { throw new Error('synthetic-private-detail'); });
  effect()();
  await vi.waitFor(() => expect(mocks.state).toHaveBeenCalledOnce());
  expect(window.location.hash).toBe('');
  expect(mocks.state.mock.calls[0][0]).not.toContain('synthetic-private-detail');
  expect(mocks.replace).not.toHaveBeenCalled();
});
