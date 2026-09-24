import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  browserClient: vi.fn(),
  getUser: vi.fn(),
  browserSignIn: vi.fn(),
  browserSignOut: vi.fn(),
  browserAdminSignOut: vi.fn(),
  suppressedErrorSignOut: vi.fn(),
  browserSetSession: vi.fn(),
  isolatedClient: vi.fn(),
  passwordSignIn: vi.fn(),
  temporarySignOut: vi.fn(),
  attempt: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.browserClient }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.isolatedClient }));
vi.mock('@/lib/rate-limit/password', () => ({ checkPasswordOperationRateLimit: mocks.attempt }));

import { reauthenticateWithPassword } from '@/lib/auth/reauth';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'operator@example.test',
};
const password = 'synthetic-password';
const temporarySession = { access_token: 'test' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-anon-key');
  mocks.browserClient.mockResolvedValue({
    auth: {
      getUser: mocks.getUser,
      signInWithPassword: mocks.browserSignIn,
      signOut: mocks.browserSignOut,
      admin: { signOut: mocks.browserAdminSignOut },
      setSession: mocks.browserSetSession,
    },
  });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.attempt.mockResolvedValue({ allowed: true, retryAfter: 0, unavailable: false });
  mocks.isolatedClient.mockReturnValue({
    auth: {
      signInWithPassword: mocks.passwordSignIn,
      signOut: mocks.suppressedErrorSignOut,
      admin: { signOut: mocks.temporarySignOut },
    },
  });
  mocks.passwordSignIn.mockResolvedValue({
    data: { user, session: temporarySession },
    error: null,
  });
  mocks.temporarySignOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  expect(mocks.browserSignIn).not.toHaveBeenCalled();
  expect(mocks.browserSignOut).not.toHaveBeenCalled();
  expect(mocks.browserAdminSignOut).not.toHaveBeenCalled();
  expect(mocks.suppressedErrorSignOut).not.toHaveBeenCalled();
  expect(mocks.browserSetSession).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('password reauthentication preserves the browser MFA session', () => {
  it('checks the current identity on a client without cookie or persistent storage', async () => {
    await expect(reauthenticateWithPassword(password)).resolves.toEqual({ ok: true });

    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.attempt).toHaveBeenCalledExactlyOnceWith(user.id);
    expect(mocks.isolatedClient).toHaveBeenCalledWith(
      'https://auth.example.test',
      'synthetic-anon-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    expect(mocks.passwordSignIn).toHaveBeenCalledWith({ email: user.email, password });
    expect(mocks.temporarySignOut).toHaveBeenCalledExactlyOnceWith(temporarySession.access_token, 'local');
  });

  it.each(['', 'x'.repeat(1025), null, undefined, 123])('rejects an invalid password input without creating a client (%s)', async (value) => {
    await expect(reauthenticateWithPassword(value as string)).resolves.toEqual({
      ok: false, error: 'invalid_password',
    });
    expect(mocks.browserClient).not.toHaveBeenCalled();
    expect(mocks.isolatedClient).not.toHaveBeenCalled();
  });

  it.each([
    { user: null, error: null },
    { user: { id: user.id }, error: null },
    { user, error: { message: 'Synthetic identity verification error' } },
  ])('does not test a password without a verified current identity (%j)', async (result) => {
    mocks.getUser.mockResolvedValue({ data: { user: result.user }, error: result.error });

    await expect(reauthenticateWithPassword(password)).resolves.toEqual({
      ok: false, error: 'not_authenticated',
    });
    expect(mocks.isolatedClient).not.toHaveBeenCalled();
  });

  it('rejects an exhausted budget before password verification', async () => {
    mocks.attempt.mockResolvedValue({ allowed: false, retryAfter: 117, unavailable: false });
    await expect(reauthenticateWithPassword(password)).resolves.toEqual({ ok: false, error: 'rate_limited', retryAfter: 117 });
    expect(mocks.isolatedClient).not.toHaveBeenCalled();
    expect(mocks.passwordSignIn).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'exception'])('fails closed if the account budget cannot be checked (%s)', async (failure) => {
    if (failure === 'exception') mocks.attempt.mockRejectedValue(new Error('synthetic-private-detail'));
    else mocks.attempt.mockResolvedValue({ allowed: false, retryAfter: 300, unavailable: true });
    await expect(reauthenticateWithPassword(password)).resolves.toEqual({ ok: false, error: 'verification_unavailable' });
    expect(mocks.isolatedClient).not.toHaveBeenCalled();
    expect(mocks.passwordSignIn).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password without logging out any existing session', async () => {
    mocks.passwordSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Synthetic invalid password' },
    });

    await expect(reauthenticateWithPassword(password)).resolves.toEqual({
      ok: false, error: 'invalid_password',
    });
    expect(mocks.temporarySignOut).not.toHaveBeenCalled();
  });

  it('rejects another returned user even when their email matches, and cleans up the temporary session', async () => {
    mocks.passwordSignIn.mockResolvedValue({
      data: { user: { ...user, id: 'different-user-fixture' }, session: temporarySession },
      error: null,
    });

    await expect(reauthenticateWithPassword(password)).resolves.toEqual({
      ok: false, error: 'unknown',
    });
    expect(mocks.temporarySignOut).toHaveBeenCalledExactlyOnceWith(temporarySession.access_token, 'local');
  });

  it('rejects a response without an authenticated session', async () => {
    mocks.passwordSignIn.mockResolvedValue({
      data: { user, session: null },
      error: null,
    });

    await expect(reauthenticateWithPassword(password)).resolves.toEqual({
      ok: false, error: 'unknown',
    });
    expect(mocks.temporarySignOut).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])('rejects a response missing the new session JWT (%s)', async (accessToken) => {
    mocks.passwordSignIn.mockResolvedValue({
      data: { user, session: { access_token: accessToken } },
      error: null,
    });

    await expect(reauthenticateWithPassword(password)).resolves.toEqual({
      ok: false, error: 'unknown',
    });
    expect(mocks.temporarySignOut).not.toHaveBeenCalled();
  });

  it('cleans up a returned session even when the response is missing its user', async () => {
    mocks.passwordSignIn.mockResolvedValue({
      data: { user: null, session: temporarySession },
      error: null,
    });

    await expect(reauthenticateWithPassword(password)).resolves.toEqual({
      ok: false, error: 'unknown',
    });
    expect(mocks.temporarySignOut).toHaveBeenCalledExactlyOnceWith(temporarySession.access_token, 'local');
  });

  it.each(['returned error', 'exception'])('fails closed when temporary-session cleanup fails (%s)', async (failure) => {
    if (failure === 'exception') {
      mocks.temporarySignOut.mockRejectedValue(new Error('Synthetic cleanup failure'));
    } else {
      mocks.temporarySignOut.mockResolvedValue({ error: { message: 'Synthetic cleanup failure' } });
    }

    await expect(reauthenticateWithPassword(password)).resolves.toEqual({
      ok: false, error: 'unknown',
    });
    expect(mocks.temporarySignOut).toHaveBeenCalledExactlyOnceWith(temporarySession.access_token, 'local');
  });

  it('waits for cleanup before authorizing the sensitive operation', async () => {
    let finishCleanup!: (result: { error: null }) => void;
    mocks.temporarySignOut.mockReturnValue(new Promise<{ error: null }>((resolve) => {
      finishCleanup = resolve;
    }));
    const finished = vi.fn();
    const pending = reauthenticateWithPassword(password).then(finished);

    await vi.waitFor(() => expect(mocks.temporarySignOut).toHaveBeenCalledOnce());
    expect(finished).not.toHaveBeenCalled();
    finishCleanup({ error: null });
    await pending;
    expect(finished).toHaveBeenCalledWith({ ok: true });
  });

  it.each([204, 401, 403, 404])('uses the real SDK and requires confirmed logout of the new session (HTTP %s)', async (logoutStatus) => {
    const actual = await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
    const calls: Array<{ pathname: string; search: string; authorization: string | null }> = [];
    const temporaryToken = 'synthetic-temporary-access-token';
    const fetchFixture: typeof fetch = vi.fn(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      const headers = new Headers(init?.headers);
      calls.push({
        pathname: url.pathname,
        search: url.search,
        authorization: headers.get('authorization'),
      });
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        expect(JSON.parse(String(init?.body))).toMatchObject({ email: user.email, password });
        return new Response(JSON.stringify({
          access_token: temporaryToken,
          refresh_token: 'synthetic-temporary-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { ...user, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/auth/v1/logout') {
        return logoutStatus === 204
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ message: 'Synthetic logout rejection', code: 'unexpected_failure' }), {
            status: logoutStatus, headers: { 'Content-Type': 'application/json' },
          });
      }
      throw new Error('Unexpected HTTP request in the hermetic reauthentication test');
    });
    mocks.isolatedClient.mockImplementation((url, key, options) => (
      actual.createClient(url, key, { ...options, global: { fetch: fetchFixture } })
    ));

    await expect(reauthenticateWithPassword(password)).resolves.toEqual(
      logoutStatus === 204 ? { ok: true } : { ok: false, error: 'unknown' },
    );

    expect(calls).toEqual([
      {
        pathname: '/auth/v1/token',
        search: '?grant_type=password',
        authorization: 'Bearer synthetic-anon-key',
      },
      {
        pathname: '/auth/v1/logout',
        search: '?scope=local',
        authorization: 'Bearer ' + temporaryToken,
      },
    ]);
    expect(mocks.isolatedClient).toHaveBeenCalledOnce();
  });
});
