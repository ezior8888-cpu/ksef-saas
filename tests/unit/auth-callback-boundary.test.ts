import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), exchange: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
import { GET } from '@/app/auth/callback/route';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test');
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
  vi.stubEnv('NODE_ENV', 'production');
  mocks.client.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchange } });
  mocks.exchange.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
function request(query: Record<string, string>) {
  return new Request('https://container.example.test/auth/callback?' + new URLSearchParams(query), {
    headers: { 'x-forwarded-host': 'attacker.example.test', 'x-forwarded-proto': 'http', origin: 'https://attacker.example.test' },
  });
}
function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
}
it.each([undefined, '', 'https://user:pass@example.test', 'https://app.example.test/unsafe', 'http://app.example.test'])('refuses unsafe config %s before Auth and does not use request headers', async (value) => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', value);
  const response = await GET(request({ code: 'fixture-code', next: '/invoices' }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'auth_unavailable' });
  expect(response.headers.get('location')).toBeNull();
  expectPrivate(response);
  expect(mocks.client).not.toHaveBeenCalled();
});
it('keeps a PKCE recovery destination and legitimate query on the configured host', async () => {
  const response = await GET(request({ code: 'fixture-code', next: '/reset-password?mode=confirm' }));
  expect(response.headers.get('location')).toBe('https://app.example.test/reset-password?mode=confirm');
  expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('fixture-code');
  expectPrivate(response);
});
it.each(['javascript:fixture', '//outside.example.test', '/\t/outside.example.test', '/a/..//outside.example.test'])('blocks unsafe PKCE destination %s', async (next) => {
  const response = await GET(request({ code: 'fixture-code', next }));
  expect(response.headers.get('location')).toBe('https://app.example.test/dashboard');
  expectPrivate(response);
});
it('passes a sanitized destination to fragment completion without Auth I/O', async () => {
  const response = await GET(request({ next: '//outside.example.test' }));
  const location = new URL(response.headers.get('location')!);
  expect(location.origin).toBe('https://app.example.test');
  expect(location.pathname).toBe('/auth/finish');
  expect(location.searchParams.get('next')).toBe('/dashboard');
  expect(mocks.client).not.toHaveBeenCalled();
  expectPrivate(response);
});
it.each(['client', 'exchange'] as const)('handles a thrown %s failure with a controlled same-origin redirect', async (name) => {
  mocks[name].mockRejectedValue(new Error('synthetic-private-detail'));
  const response = await GET(request({ code: 'fixture-code' }));
  expect(response.headers.get('location')).toBe('https://app.example.test/login?error=auth_callback_failed');
  expectPrivate(response);
});
it('never includes returned Auth error text in the redirect', async () => {
  mocks.exchange.mockResolvedValue({ error: { message: 'synthetic-private-detail' } });
  const response = await GET(request({ code: 'fixture-code' }));
  expect(response.headers.get('location')).toBe('https://app.example.test/login?error=auth_callback_failed');
});
it.each(['?code=first&code=second', '?code=' + 'x'.repeat(2049)])('rejects ambiguous or oversized codes before Auth', async (query) => {
  const response = await GET(new Request('https://container.example.test/auth/callback' + query));
  expect(response.headers.get('location')).toBe('https://app.example.test/login?error=auth_callback_failed');
  expect(mocks.client).not.toHaveBeenCalled();
});
