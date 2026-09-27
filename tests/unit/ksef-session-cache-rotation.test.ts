import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KsefAuth, KsefAuthSession } from '@/lib/ksef/auth';

const mocks = vi.hoisted(() => ({
  xades: vi.fn(),
  token: vi.fn(),
  credentials: vi.fn(),
}));

vi.mock('@/lib/ksef/auth', () => ({ authenticateWithXades: mocks.xades }));
vi.mock('@/lib/ksef/auth-token', () => ({ authenticateWithToken: mocks.token }));
vi.mock('@/lib/supabase/admin-queries', () => ({
  getTenantKsefCredentials: mocks.credentials,
}));

import { ksefSessionCache } from '@/lib/ksef/session-cache';

const NOW = 1_700_000_000_000;
const NIP = '1234567890';

function xades(certificatePem: string, privateKeyPem: string): KsefAuth {
  return { type: 'xades', nip: NIP, certificatePem, privateKeyPem };
}

function token(value: string): KsefAuth {
  return { type: 'token', nip: NIP, token: value };
}

function session(accessToken: string, accessTokenExpiresAt = NOW + 60 * 60 * 1000): KsefAuthSession {
  return {
    accessToken,
    refreshToken: `refresh-${accessToken}`,
    accessTokenExpiresAt,
    refreshTokenExpiresAt: accessTokenExpiresAt + 60 * 60 * 1000,
    nip: NIP,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  ksefSessionCache.invalidate(NIP, 'test');
  ksefSessionCache.invalidate(NIP, 'demo');
  ksefSessionCache.invalidate(NIP, 'production');
});

afterEach(() => vi.restoreAllMocks());

describe('KSeF session cache credential boundary', () => {
  it('reuses a session only for the same certificate and key, even with an unchanged NIP', async () => {
    const first = session('first-session');
    const second = session('second-session');
    const third = session('third-session');
    mocks.xades.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(third);

    const original = xades('CERT_A', 'PRIVATE_KEY_A');
    expect(await ksefSessionCache.getSession(original, 'test')).toBe(first);
    expect(await ksefSessionCache.getSession({ ...original }, 'test')).toBe(first);
    expect(await ksefSessionCache.getSession(xades('CERT_B', 'PRIVATE_KEY_A'), 'test')).toBe(second);
    expect(await ksefSessionCache.getSession(xades('CERT_B', 'PRIVATE_KEY_B'), 'test')).toBe(third);
    expect(mocks.xades).toHaveBeenCalledTimes(3);
  });

  it('re-authenticates after changing a KSeF token for the same NIP', async () => {
    const first = session('first-token-session');
    const second = session('second-token-session');
    mocks.token.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    expect(await ksefSessionCache.getSession(token('SECRET_TOKEN_A'), 'test')).toBe(first);
    expect(await ksefSessionCache.getSession(token('SECRET_TOKEN_A'), 'test')).toBe(first);
    expect(await ksefSessionCache.getSession(token('SECRET_TOKEN_B'), 'test')).toBe(second);
    expect(mocks.token).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a certificate session as a token session for the same NIP', async () => {
    const certificateSession = session('certificate-session');
    const tokenSession = session('token-session');
    mocks.xades.mockResolvedValue(certificateSession);
    mocks.token.mockResolvedValue(tokenSession);

    expect(await ksefSessionCache.getSession(xades('CERT_A', 'PRIVATE_KEY_A'), 'test')).toBe(certificateSession);
    expect(await ksefSessionCache.getSession(token('SECRET_TOKEN_A'), 'test')).toBe(tokenSession);
    expect(mocks.xades).toHaveBeenCalledOnce();
    expect(mocks.token).toHaveBeenCalledOnce();
  });

  it('isolates sessions by KSeF environment as well as NIP and credentials', async () => {
    const testSession = session('test-session');
    const prodSession = session('prod-session');
    mocks.xades.mockResolvedValueOnce(testSession).mockResolvedValueOnce(prodSession);
    const auth = xades('CERT_A', 'PRIVATE_KEY_A');

    expect(await ksefSessionCache.getSession(auth, 'test')).toBe(testSession);
    expect(await ksefSessionCache.getSession(auth, 'production')).toBe(prodSession);
    expect(await ksefSessionCache.getSession(auth, 'test')).toBe(testSession);
    expect(mocks.xades).toHaveBeenCalledTimes(2);
  });

  it('refreshes when the access token enters the five-minute expiry buffer', async () => {
    const first = session('nearly-expired', NOW + 5 * 60 * 1000 + 1000);
    const second = session('refreshed');
    mocks.xades.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const auth = xades('CERT_A', 'PRIVATE_KEY_A');

    expect(await ksefSessionCache.getSession(auth, 'test')).toBe(first);
    vi.mocked(Date.now).mockReturnValue(NOW + 1000);
    expect(await ksefSessionCache.getSession(auth, 'test')).toBe(first);
    vi.mocked(Date.now).mockReturnValue(NOW + 1001);
    expect(await ksefSessionCache.getSession(auth, 'test')).toBe(second);
    expect(mocks.xades).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent requests for matching credentials', async () => {
    const pending = deferred<KsefAuthSession>();
    mocks.xades.mockReturnValue(pending.promise);
    const auth = xades('CERT_A', 'PRIVATE_KEY_A');

    const first = ksefSessionCache.getSession(auth, 'test');
    const second = ksefSessionCache.getSession(auth, 'test');
    expect(mocks.xades).toHaveBeenCalledOnce();
    pending.resolve(session('shared-session'));
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toBe(secondResult);
  });

  it('never joins an old pending auth flow after rotating credentials', async () => {
    const oldPending = deferred<KsefAuthSession>();
    const newPending = deferred<KsefAuthSession>();
    mocks.xades.mockReturnValueOnce(oldPending.promise).mockReturnValueOnce(newPending.promise);
    const oldAuth = xades('CERT_OLD', 'PRIVATE_KEY_OLD');
    const newAuth = xades('CERT_NEW', 'PRIVATE_KEY_NEW');

    const oldRequest = ksefSessionCache.getSession(oldAuth, 'test');
    const newRequest = ksefSessionCache.getSession(newAuth, 'test');
    expect(mocks.xades).toHaveBeenCalledTimes(2);

    const newSession = session('new-session');
    newPending.resolve(newSession);
    expect(await newRequest).toBe(newSession);
    oldPending.resolve(session('old-session'));
    await oldRequest;
    expect(await ksefSessionCache.getSession(newAuth, 'test')).toBe(newSession);
    expect(mocks.xades).toHaveBeenCalledTimes(2);
  });

  it('does not revive an invalidated in-flight session', async () => {
    const oldPending = deferred<KsefAuthSession>();
    const replacement = session('replacement-session');
    mocks.xades.mockReturnValueOnce(oldPending.promise).mockResolvedValueOnce(replacement);
    const auth = xades('CERT_A', 'PRIVATE_KEY_A');

    const oldRequest = ksefSessionCache.getSession(auth, 'test');
    ksefSessionCache.invalidate(NIP, 'test');
    expect(await ksefSessionCache.getSession(auth, 'test')).toBe(replacement);
    oldPending.resolve(session('invalidated-session'));
    await oldRequest;
    expect(await ksefSessionCache.getSession(auth, 'test')).toBe(replacement);
    expect(mocks.xades).toHaveBeenCalledTimes(2);
  });
});
