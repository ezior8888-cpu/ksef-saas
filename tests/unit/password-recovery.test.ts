import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getVerifiedPasswordRecoveryState } from '@/lib/auth/password-recovery';

const NOW = 1_789_560_000;
const token = 'synthetic-signed-recovery-access-token';
const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const auth = { getSession: vi.fn(), getUser: vi.fn(), getClaims: vi.fn() };
const client = { auth };
const now = () => NOW * 1000;
let claims: Record<string, unknown>;
let user: {
  id: string;
  email: string;
  factors?: { id: string; status: string; factor_type: string }[];
};

beforeEach(() => {
  vi.resetAllMocks();
  user = { id: userId, email: 'fixture@example.test', factors: [] };
  claims = {
    sub: userId, session_id: sessionId, aal: 'aal1', iat: NOW,
    amr: [{ method: 'recovery', timestamp: NOW - 60 }],
  };
  auth.getSession.mockResolvedValue({
    data: { session: { access_token: token, user: { id: 'untrusted-cookie-user', factors: [] } } },
    error: null,
  });
  auth.getUser.mockImplementation(async () => ({ data: { user }, error: null }));
  auth.getClaims.mockImplementation(async () => ({ data: { claims }, error: null }));
});

describe('verified recovery authorization', () => {
  it('verifies identity and claims of the same exact token without trusting the cookie user', async () => {
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'verified', user, sessionId, accessToken: token });
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(auth.getUser).toHaveBeenCalledExactlyOnceWith(token);
    expect(auth.getClaims).toHaveBeenCalledExactlyOnceWith(token);
  });

  it('does not re-read a changing session between identity and claims verification', async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: token } }, error: null });
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'different-token' } }, error: null });
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'verified', user, sessionId, accessToken: token });
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(auth.getUser).toHaveBeenCalledExactlyOnceWith(token);
    expect(auth.getClaims).toHaveBeenCalledExactlyOnceWith(token);
  });

  it.each(['password', 'oauth', 'otp', 'magiclink', 'email/signup', 'invite', 'mfa/recovery_code'])
  ('rejects an ordinary or unrelated %s session even at AAL2', async (method) => {
    claims.aal = 'aal2';
    claims.amr = [{ method, timestamp: NOW }];
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
  });

  it('ignores forged recovery metadata and cookie claims', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: {
        access_token: token,
        amr: [{ method: 'recovery', timestamp: NOW }],
        user: { id: userId, user_metadata: { type: 'recovery' } },
      } }, error: null,
    });
    claims.amr = [{ method: 'password', timestamp: NOW }];
    claims.user_metadata = { type: 'recovery' };
    claims.redirectType = 'recovery';
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
  });

  it.each([null, undefined, {}, 'recovery', ['recovery'], [null], [{ method: 'Recovery', timestamp: NOW }]])
  ('rejects missing, malformed or untimed proof %#', async (amr) => {
    claims.amr = amr;
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
  });

  it.each([undefined, null, String(NOW), NOW - 0.5, NaN, Infinity, -Infinity, -1, 0, Number.MAX_SAFE_INTEGER + 1])
  ('rejects invalid recovery timestamp %#', async (timestamp) => {
    claims.amr = [{ method: 'recovery', timestamp }];
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
  });

  it.each([undefined, null, '', 'foreign-user'])('rejects mismatched subject %#', async (sub) => {
    claims.sub = sub;
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
  });

  it.each([undefined, null, '', 123, 'not-a-uuid', '00000000-0000-0000-0000-000000000000', '22222222-2222-4222-0222-222222222222'])
  ('rejects invalid session identifiers %#', async (id) => {
    claims.session_id = id;
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
  });

  it.each([undefined, null, '', 'aal3', 'AAL2', 2])('rejects invalid assurance %#', async (aal) => {
    claims.aal = aal;
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
  });
});

describe('bounded recovery age', () => {
  it.each([0, 1, 899])('accepts a proof %s seconds old', async (age) => {
    claims.amr = [{ method: 'recovery', timestamp: NOW - age }];
    expect((await getVerifiedPasswordRecoveryState(client, now)).status).toBe('verified');
  });

  it.each([900, 901, 86_400])('expires a proof %s seconds old despite a freshly issued JWT', async (age) => {
    claims.amr = [{ method: 'recovery', timestamp: NOW - age }];
    claims.iat = NOW;
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'expired' });
  });

  it('does not round sub-second expiry down to extend the window', async () => {
    claims.amr = [{ method: 'recovery', timestamp: NOW - 900 }];
    expect(await getVerifiedPasswordRecoveryState(client, () => NOW * 1000 + 1)).toEqual({ status: 'expired' });
  });

  it.each([1, 30])('tolerates %s seconds of future clock skew', async (offset) => {
    claims.amr = [{ method: 'recovery', timestamp: NOW + offset }];
    expect((await getVerifiedPasswordRecoveryState(client, now)).status).toBe('verified');
  });

  it.each([31, 3600])('rejects proof %s seconds in the future', async (offset) => {
    claims.amr = [{ method: 'recovery', timestamp: NOW + offset }];
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
  });

  it.each([true, false])('selects the most recent valid recovery regardless of order (%s)', async (reverse) => {
    const entries = [
      { method: 'recovery', timestamp: NOW - 3600 },
      { method: 'recovery', timestamp: NOW - 30 },
      { method: 'password', timestamp: NOW },
      { method: 'recovery', timestamp: NOW + 60 },
      { method: 'recovery', timestamp: 'invalid' },
    ];
    claims.amr = reverse ? entries.reverse() : entries;
    expect((await getVerifiedPasswordRecoveryState(client, now)).status).toBe('verified');
  });

  it('does not let a malformed newer recovery entry renew an expired valid one', async () => {
    claims.amr = [
      { method: 'recovery', timestamp: NOW - 3600 },
      { method: 'recovery', timestamp: NOW + 31 },
      { method: 'recovery', timestamp: String(NOW) },
    ];
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'expired' });
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])('fails closed on an invalid clock %#', async (time) => {
    expect(await getVerifiedPasswordRecoveryState(client, () => time)).toEqual({ status: 'invalid' });
  });
});

describe('MFA remains required during password recovery', () => {
  it.each(['totp', 'phone', 'webauthn', 'future-factor'])('challenges AAL1 with a verified %s factor', async (type) => {
    user.factors = [{ id: 'factor', factor_type: type, status: 'verified' }];
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'challenge_required', user, sessionId, accessToken: token });
  });

  it.each(['totp', 'phone', 'webauthn', 'future-factor'])('accepts AAL2 with a verified %s factor', async (type) => {
    claims.aal = 'aal2';
    user.factors = [{ id: 'factor', factor_type: type, status: 'verified' }];
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'verified', user, sessionId, accessToken: token });
  });

  it.each([undefined, [], [{ id: 'factor', factor_type: 'totp', status: 'unverified' }]])
  ('does not require enrollment for an ordinary account %#', async (factors) => {
    user.factors = factors;
    expect((await getVerifiedPasswordRecoveryState(client, now)).status).toBe('verified');
  });

  it('requires the verified factor even if an earlier factor is unverified', async () => {
    user.factors = [
      { id: 'unverified', factor_type: 'totp', status: 'unverified' },
      { id: 'verified', factor_type: 'phone', status: 'verified' },
    ];
    expect((await getVerifiedPasswordRecoveryState(client, now)).status).toBe('challenge_required');
  });

  it('returns expired before offering MFA for an expired recovery', async () => {
    user.factors = [{ id: 'factor', factor_type: 'totp', status: 'verified' }];
    claims.amr = [{ method: 'recovery', timestamp: NOW - 901 }];
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'expired' });
  });
});

describe('verification failures', () => {
  it('reports missing sessions without requesting identity or claims', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'unauthenticated' });
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it('rejects a token that no longer has an authenticated user', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'unauthenticated' });
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it.each(['getSession', 'getUser', 'getClaims'] as const)('fails closed on %s errors even with otherwise valid data', async (operation) => {
    const data = operation === 'getSession' ? { session: { access_token: token } }
      : operation === 'getUser' ? { user } : { claims };
    auth[operation].mockResolvedValue({ data, error: { message: 'sensitive-provider-detail' } });
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
  });

  it.each(['getSession', 'getUser', 'getClaims'] as const)('contains %s exceptions without logging their content', async (operation) => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warningLog = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      auth[operation].mockRejectedValue(new Error('sensitive-provider-detail'));
      expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
      expect(errorLog).not.toHaveBeenCalled();
      expect(warningLog).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore(); warningLog.mockRestore(); log.mockRestore();
    }
  });

  it.each([null, {}, { claims: null }])('fails closed on malformed verified claims response %#', async (data) => {
    auth.getClaims.mockResolvedValue({ data, error: null });
    expect(await getVerifiedPasswordRecoveryState(client, now)).toEqual({ status: 'invalid' });
  });
});
