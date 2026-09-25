import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  effect: vi.fn(), state: vi.fn(), replace: vi.fn(), client: vi.fn(), clear: vi.fn(),
  next: '/invoices?status=paid',
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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.next = '/invoices?status=paid';
  const location = {
    hash: '#access_token=fixture-access&refresh_token=fixture-refresh',
    pathname: '/auth/finish', search: '?next=//outside.example.test',
  };
  mocks.clear.mockImplementation(() => { location.hash = ''; location.search = ''; });
  vi.stubGlobal('window', { location, history: { replaceState: mocks.clear } });
  mocks.client.mockImplementation(() => { throw new Error('Finish must not instantiate Auth'); });
});
afterEach(() => {
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
function effect() {
  renderToStaticMarkup(<FinishPage />);
  expect(mocks.effect).toHaveBeenCalledOnce();
  return mocks.effect.mock.calls[0][0] as () => (() => void);
}
it('clears URL once across StrictMode replay and asks for a fresh supported link', async () => {
  const runEffect = effect();
  const cleanupFirst = runEffect();
  expect(window.location.hash).toBe('');
  expect(window.location.search).toBe('');
  expect(mocks.clear).toHaveBeenCalledExactlyOnceWith(null, '', '/auth/finish');
  cleanupFirst();
  const cleanupSecond = runEffect();
  await vi.waitFor(() => expect(mocks.state).toHaveBeenCalledOnce());
  expect(mocks.state.mock.calls[0][0]).toContain('nie jest już obsługiwany');
  expect(mocks.clear).toHaveBeenCalledOnce();
  cleanupSecond();
});
it('does not update UI after unmount', async () => {
  const cleanup = effect()();
  cleanup();
  await Promise.resolve(); await Promise.resolve();
  expect(mocks.state).not.toHaveBeenCalled();
});
it('clears fragment errors before showing a controlled message', async () => {
  window.location.hash = '#error_description=synthetic-private-detail&access_token=fixture-access';
  effect()();
  await vi.waitFor(() => expect(mocks.state).toHaveBeenCalledOnce());
  expect(window.location.hash).toBe('');
  expect(mocks.state.mock.calls[0][0]).not.toContain('synthetic-private-detail');
});
it('does not follow a user-controlled destination', async () => {
  mocks.next = 'javascript:fixture';
  effect()();
  await vi.waitFor(() => expect(mocks.state).toHaveBeenCalledOnce());
  expect(mocks.state.mock.calls[0][0]).not.toContain('javascript:');
});
it('keeps errors controlled when history replacement fails', async () => {
  mocks.clear.mockImplementation(() => { throw new Error('synthetic-private-detail'); });
  effect()();
  await vi.waitFor(() => expect(mocks.state).toHaveBeenCalledOnce());
  expect(mocks.state.mock.calls[0][0]).not.toContain('synthetic-private-detail');
});
