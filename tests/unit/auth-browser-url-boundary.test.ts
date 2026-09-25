import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ server: vi.fn(), network: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.server }));
vi.mock('@supabase/ssr', async (original) => {
  const sdk = await original<typeof import('@supabase/ssr')>();
  return {
    ...sdk,
    // Isolate instances between cases; preserve the application's auth options.
    createBrowserClient: (url: string, key: string, options?: SupabaseClientOptions<'public'>) =>
      sdk.createBrowserClient(url, key, { ...options, isSingleton: false }),
  };
});
import { createClient } from '@/lib/supabase/client';
import { finishSignInFromFragment } from '@/lib/auth/finish-sign-in';
import { GET } from '@/app/auth/callback/route';

const origin = 'https://app.example.test';
const storageKey = 'sb-auth-auth-token';
let jar: Map<string, string>;
let writes: string[];
let clients: SupabaseClient[];
let location: URL;
let history: { state: null; replaceState: (state: unknown, unused: string, url: string) => void };
function session(id: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const access_token = [encode({ alg: 'HS256', typ: 'JWT' }), encode({ sub: id, exp }), encode('synthetic-signature')].join('.');
  return {
    access_token, refresh_token: 'synthetic-refresh-' + id, expires_at: exp,
    expires_in: 3600, token_type: 'bearer',
    user: { id, aud: 'authenticated', email: id + '@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
}
function browserClient() {
  const client = createClient();
  clients.push(client);
  return client;
}
function storedSession() {
  const value = jar.get(storageKey)!;
  return JSON.parse(value.startsWith('base64-') ? Buffer.from(value.slice(7), 'base64url').toString('utf8') : value);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-local-anon-key');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', origin);
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
  jar = new Map(); writes = []; clients = [];
  location = new URL(origin + '/auth/finish');
  history = {
    state: null,
    replaceState: vi.fn((_state: unknown, _unused: string, url: string) => { location.href = new URL(url, origin).href; }),
  };
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  };
  const document = {
    // A background browser tab avoids unrelated refresh timers in local tests.
    visibilityState: 'hidden',
    get cookie() { return [...jar].map(([name, value]) => name + '=' + encodeURIComponent(value)).join('; '); },
    set cookie(value: string) {
      writes.push(value);
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      if (/max-age=0(?:;|$)/i.test(value)) jar.delete(name);
      else jar.set(name, decodeURIComponent(pair.slice(separator + 1)));
    },
  };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', { document, location, history, localStorage, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('BroadcastChannel', undefined);
  mocks.network.mockImplementation(() => { throw new Error('Unexpected network request in synthetic browser'); });
  vi.stubGlobal('fetch', mocks.network);
});
afterEach(async () => {
  await Promise.all(clients.map((client) => client.auth.stopAutoRefresh()));
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe('real browser SDK never imports an unsolicited URL session', () => {
  it.each([false, true])('rejects implicit account B while preserving an existing session: %s', async (existingSession) => {
    const accountA = session('account-a');
    const accountB = session('account-b');
    if (existingSession) jar.set(storageKey, JSON.stringify(accountA));
    location.hash = new URLSearchParams({
      access_token: accountB.access_token, refresh_token: accountB.refresh_token,
      expires_in: '3600', token_type: 'bearer', type: 'recovery',
    }).toString();
    // A different component may instantiate Auth before the finish effect runs.
    const client = browserClient();
    expect((await client.auth.getSession()).data.session?.user.id ?? null).toBe(existingSession ? 'account-a' : null);
    const result = await finishSignInFromFragment({
      fragment: location.hash,
      clearFragment: () => history.replaceState(null, '', location.pathname),
    });
    expect(result).toEqual({ ok: false, error: 'legacy_link' });
    expect(location.hash).toBe('');
    expect((await client.auth.getSession()).data.session?.user.id ?? null).toBe(existingSession ? 'account-a' : null);
    expect(mocks.network).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    if (existingSession) expect(storedSession().user.id).toBe('account-a');
    else expect(jar.has(storageKey)).toBe(false);
  });

  it('leaves a code and verifier for the server callback instead of exchanging them during browser initialization', async () => {
    jar.set(storageKey, JSON.stringify(session('account-a')));
    jar.set(storageKey + '-code-verifier', JSON.stringify('synthetic-pkce-verifier'));
    location.search = '?code=synthetic-pkce-code';
    const client = browserClient();
    expect((await client.auth.getSession()).data.session?.user.id).toBe('account-a');
    expect(mocks.network).not.toHaveBeenCalled();
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(jar.get(storageKey + '-code-verifier')).toBe(JSON.stringify('synthetic-pkce-verifier'));
  });

  it('still completes supported PKCE on the server and reads the resulting session in the browser', async () => {
    const accountA = session('account-a');
    jar.set(storageKey + '-code-verifier', JSON.stringify('synthetic-pkce-verifier'));
    mocks.network.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      expect(url.origin).toBe('https://auth.example.test');
      expect(url.pathname).toBe('/auth/v1/token');
      expect(url.searchParams.get('grant_type')).toBe('pkce');
      expect(JSON.parse(String(init?.body))).toEqual({ auth_code: 'synthetic-pkce-code', code_verifier: 'synthetic-pkce-verifier' });
      return Response.json(accountA);
    });
    const server = createServerClient('https://auth.example.test', 'synthetic-local-anon-key', {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (values) => {
          values.forEach(({ name, value, options }) => {
            if (options.maxAge === 0) jar.delete(name); else jar.set(name, value);
          });
        },
      },
      global: { fetch: mocks.network },
    });
    clients.push(server);
    mocks.server.mockResolvedValue(server);
    const response = await GET(new Request(origin + '/auth/callback?code=synthetic-pkce-code&next=/reset-password'));
    expect(response.headers.get('location')).toBe(origin + '/reset-password');
    expect(mocks.network).toHaveBeenCalledOnce();
    expect(jar.has(storageKey + '-code-verifier')).toBe(false);
    expect(storedSession().user.id).toBe('account-a');
    location.href = origin + '/reset-password';
    const browser = browserClient();
    expect((await browser.auth.getSession()).data.session?.user.id).toBe('account-a');
    expect(mocks.network).toHaveBeenCalledOnce();
  });
});
