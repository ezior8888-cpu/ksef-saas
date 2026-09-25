import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  client: vi.fn(), session: vi.fn(), user: vi.fn(), claims: vi.fn(), update: vi.fn(), logout: vi.fn(), globalLogout: vi.fn(),
  limit: vi.fn(), claim: vi.fn(), password: vi.fn(), audit: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/rate-limit/password', () => ({ checkPasswordOperationRateLimit: mocks.limit, claimPasswordRecoverySession: mocks.claim }));
vi.mock('@/lib/auth/password', () => ({ validatePassword: mocks.password }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { resetPasswordAction } from '@/app/(auth)/reset-password/actions';

const id = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const user = { id, aud: 'authenticated', email: 'fixture@example.test', factors: [], app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const password = 'Synthetic-new-pass!123';
function claims(amr = [{ method: 'recovery', timestamp: Math.floor(Date.now() / 1000) }], aal = 'aal1') {
  return { data: { claims: { sub: id, session_id: sessionId, aal, amr } }, error: null };
}
function form() {
  const data = new FormData(); data.set('new_password', password); data.set('confirm_password', password); return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
  mocks.client.mockResolvedValue({ auth: { getSession: mocks.session, getUser: mocks.user, getClaims: mocks.claims, updateUser: mocks.update, signOut: mocks.logout, admin: { signOut: mocks.globalLogout } } });
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'verified-recovery-token', user: { id: 'forged' } } }, error: null });
  mocks.user.mockResolvedValue({ data: { user }, error: null });
  mocks.claims.mockResolvedValue(claims());
  mocks.limit.mockResolvedValue({ allowed: true, unavailable: false, retryAfter: 0 });
  mocks.claim.mockResolvedValue({ allowed: true, unavailable: false, retryAfter: 0 });
  mocks.password.mockResolvedValue({ valid: true });
  mocks.update.mockResolvedValue({ data: { user }, error: null });
  mocks.logout.mockResolvedValue({ error: null });
  mocks.globalLogout.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('recovery password update boundary', () => {
  it.each(['password', 'oauth', 'otp', 'magiclink'])('denies %s sessions even when user metadata pretends recovery', async (method) => {
    mocks.claims.mockResolvedValue(claims([{ method, timestamp: Math.floor(Date.now() / 1000) }]));
    mocks.user.mockResolvedValue({ data: { user: { ...user, user_metadata: { recovery: true, aal: 'aal2' } } }, error: null });
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'invalid_link' });
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.password).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects expired proof, mismatched identity and missing sessions', async () => {
    mocks.claims.mockResolvedValueOnce(claims([{ method: 'recovery', timestamp: Math.floor(Date.now() / 1000) - 901 }]));
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'invalid_link' });
    mocks.user.mockResolvedValueOnce({ data: { user: { ...user, id: 'other' } }, error: null });
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'invalid_link' });
    mocks.session.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'invalid_link' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(['totp', 'phone', 'webauthn'])('never substitutes email recovery for verified %s MFA', async (factor_type) => {
    mocks.user.mockResolvedValue({ data: { user: { ...user, factors: [{ id: 'factor', factor_type, status: 'verified' }] } }, error: null });
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'mfa_required' });
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
    mocks.claims.mockResolvedValue(claims(undefined, 'aal2'));
    expect(await resetPasswordAction(null, form())).toEqual({ ok: true, localSessionCleared: true, globalSignOutConfirmed: true });
  });
  it.each(['', 'x'.repeat(129), new File(['password'], 'fixture')])('rejects malformed password before Auth %#', async (value) => {
    const data = form(); data.set('new_password', value);
    expect(await resetPasswordAction(null, data)).toEqual({ ok: false, error: 'weak_password' });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('requires confirmation and ignores attacker-supplied identity or recovery flags', async () => {
    const data = form(); data.set('confirm_password', 'different');
    expect(await resetPasswordAction(null, data)).toEqual({ ok: false, error: 'password_mismatch' });
    expect(mocks.client).not.toHaveBeenCalled();
    data.set('confirm_password', password); data.set('user_id', 'attacker'); data.set('session_id', 'attacker'); data.set('type', 'recovery');
    expect(await resetPasswordAction(null, data)).toEqual({ ok: true, localSessionCleared: true, globalSignOutConfirmed: true });
    expect(mocks.claim).toHaveBeenCalledExactlyOnceWith(sessionId);
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(id);
  });
  it.each([false, true])('rejects denied/outage account limit (%s) before breach or claim', async (unavailable) => {
    mocks.limit.mockResolvedValue({ allowed: false, unavailable, retryAfter: 42 });
    expect(await resetPasswordAction(null, form())).toEqual(unavailable ? { ok: false, error: 'verification_unavailable' } : { ok: false, error: 'rate_limited', retryAfter: 42 });
    expect(mocks.password).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(['weak', 'breached'])('rejects %s password without consuming recovery', async (reason) => {
    mocks.password.mockResolvedValue({ valid: false, reason });
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: reason === 'weak' ? 'weak_password' : 'password_breached' });
    expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([false, true])('denies used/outage recovery claim (%s)', async (unavailable) => {
    mocks.claim.mockResolvedValue({ allowed: false, unavailable, retryAfter: 42 });
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: unavailable ? 'verification_unavailable' : 'restart_required' });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each(['reauthentication_needed', 'current_password_required', 'weak_password', 'insufficient_aal', 'same_password', 'unexpected_failure'])('does not weaken checks or retry after Auth %s', async (code) => {
    mocks.update.mockResolvedValue({ data: { user: null }, error: { code, message: 'private user data' } });
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'restart_required' });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ password });
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.logout).not.toHaveBeenCalled();
  });
  it.each([null, { id: 'different' }])('does not report success for an unconfirmed identity %#', async (updated) => {
    mocks.update.mockResolvedValue({ data: { user: updated }, error: null });
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'restart_required' });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('does not claim that session closure succeeded after logout errors', async () => {
    mocks.logout.mockResolvedValueOnce({ error: { message: 'private detail' } });
    expect(await resetPasswordAction(null, form())).toEqual({ ok: true, localSessionCleared: false, globalSignOutConfirmed: true });
    mocks.logout.mockRejectedValueOnce(new Error('private detail'));
    expect(await resetPasswordAction(null, form())).toEqual({ ok: true, localSessionCleared: false, globalSignOutConfirmed: true });
    expect(mocks.audit).toHaveBeenCalledTimes(2);
  });
  it('orders proof, rate, strength, claim, update, audit and global signout without secret audit data', async () => {
    expect(await resetPasswordAction(null, form())).toEqual({ ok: true, localSessionCleared: true, globalSignOutConfirmed: true });
    const sequence = [mocks.claims, mocks.limit, mocks.password, mocks.claim, mocks.update, mocks.audit, mocks.globalLogout, mocks.logout];
    const order = sequence.map((mock) => mock.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ password });
    expect(mocks.globalLogout).toHaveBeenCalledExactlyOnceWith('verified-recovery-token', 'global');
    expect(mocks.logout).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({ action: 'auth.password_changed', tenantId: null, userId: id, metadata: { method: 'email_recovery' } });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(password);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(sessionId);
  });
  it('permits one update across concurrent submissions using the atomic claim outcome', async () => {
    let used = false;
    mocks.claim.mockImplementation(async () => {
      const allowed = !used; used = true; return { allowed, unavailable: false, retryAfter: allowed ? 0 : 960 };
    });
    const results = await Promise.all([resetPasswordAction(null, form()), resetPasswordAction(null, form())]);
    expect(results).toContainEqual({ ok: true, localSessionCleared: true, globalSignOutConfirmed: true });
    expect(results).toContainEqual({ ok: false, error: 'restart_required' });
    expect(mocks.update).toHaveBeenCalledTimes(1); expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it('fails closed on thrown clients, limiters and validation without reflecting details', async () => {
    mocks.client.mockRejectedValueOnce(new Error('secret'));
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'verification_unavailable' });
    mocks.limit.mockRejectedValueOnce(new Error('secret'));
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'verification_unavailable' });
    mocks.password.mockRejectedValueOnce(new Error('secret'));
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'verification_unavailable' });
    mocks.claim.mockRejectedValueOnce(new Error('secret'));
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'verification_unavailable' });
    mocks.update.mockRejectedValueOnce(new Error('secret'));
    expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'restart_required' });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

it.each([204, 401, 403, 404, 500])('uses installed SDK and honestly reports global logout HTTP %i', async (status) => {
  const { createClient } = await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = [encode({ alg: 'HS256', typ: 'JWT' }), encode({ sub: id, session_id: sessionId, aal: 'aal1', amr: [{ method: 'recovery', timestamp: now }], exp: now + 3600, iat: now }), 'synthetic-signature'].join('.');
  let stored: string | null = JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: now + 3600, expires_in: 3600, user });
  const requests: Array<{ method: string; path: string; authorization: string | null; body: unknown }> = [];
  const sdk = createClient('https://auth.example.test', 'synthetic-anon', {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true, storageKey: 'test-session',
      storage: { getItem: () => stored, setItem: (_key, value) => { stored = value; }, removeItem: () => { stored = null; } } },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      const method = init?.method ?? 'GET';
      requests.push({ method, path: url.pathname + url.search, authorization: new Headers(init?.headers).get('authorization'), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.pathname === '/auth/v1/user' && (method === 'GET' || method === 'PUT')) return new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
      if (url.pathname === '/auth/v1/logout' && method === 'POST') {
        if (url.searchParams.get('scope') === 'global' && status !== 204) {
          return new Response(JSON.stringify({ msg: 'synthetic refusal' }), { status, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(null, { status: 204 });
      }
      throw new Error('Unexpected Auth request');
    } },
  });
  mocks.client.mockResolvedValue(sdk);
  expect(await resetPasswordAction(null, form())).toEqual({ ok: true, localSessionCleared: true, globalSignOutConfirmed: status === 204 });
  expect(requests.every((request) => request.authorization === 'Bearer ' + token)).toBe(true);
  expect(requests.filter((request) => request.method === 'PUT')).toEqual([{
    method: 'PUT', path: '/auth/v1/user', authorization: 'Bearer ' + token,
    body: { password, code_challenge: null, code_challenge_method: null },
  }]);
  expect(requests.find((request) => request.method === 'POST')?.path).toBe('/auth/v1/logout?scope=global');
  expect(stored).toBeNull();
});

it('rechecks freshness, identity, session and current MFA after password validation', async () => {
  mocks.claims.mockResolvedValueOnce(claims()).mockResolvedValueOnce(claims([{ method: 'recovery', timestamp: Math.floor(Date.now()/1000) - 901 }]));
  expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'invalid_link' });
  mocks.claims.mockResolvedValueOnce(claims()).mockResolvedValueOnce({ data: { claims: { ...claims().data.claims, session_id: '33333333-3333-4333-8333-333333333333' } }, error: null });
  expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'invalid_link' });
  mocks.user.mockResolvedValueOnce({ data: { user }, error: null }).mockResolvedValueOnce({ data: { user: { ...user, factors: [{ id: 'new', factor_type: 'totp', status: 'verified' }] } }, error: null });
  expect(await resetPasswordAction(null, form())).toEqual({ ok: false, error: 'mfa_required' });
  expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
it('retains password success but warns on a thrown global revocation', async () => {
  mocks.globalLogout.mockRejectedValue(new Error('sensitive service detail'));
  expect(await resetPasswordAction(null, form())).toEqual({ ok: true, localSessionCleared: true, globalSignOutConfirmed: false });
  expect(mocks.logout).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
});
