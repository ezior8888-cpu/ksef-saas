import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(), getSession: vi.fn(), getUser: vi.fn(), getClaims: vi.fn(),
  challenge: vi.fn(), verify: vi.fn(), limit: vi.fn(), audit: vi.fn(),
  consume: vi.fn(), generate: vi.fn(), revalidate: vi.fn(),
  enroll: vi.fn(), unenroll: vi.fn(), reauth: vi.fn(), password: vi.fn(), updateUser: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/rate-limit/mfa', () => ({ checkMfaRateLimit: mocks.limit }));
vi.mock('@/lib/rate-limit/password', () => ({ checkPasswordOperationRateLimit: mocks.limit, checkPasswordNonceSendRateLimit: mocks.limit }));
vi.mock('@/lib/auth/mfa-recovery', () => ({
  consumeRecoveryCode: mocks.consume, generateAndStoreRecoveryCodes: mocks.generate, deleteAllRecoveryCodes: vi.fn(),
}));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('@/lib/auth/reauth', () => ({ reauthenticateWithPassword: mocks.reauth }));
vi.mock('@/lib/auth/password', () => ({ validatePassword: mocks.password }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('redirect:' + url); } }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

import { verifyMfaChallengeAction } from '@/app/(auth)/login/two-factor/actions';
import { enrollTotpAction, verifyTotpEnrollmentAction, changePasswordAction } from '@/app/(dashboard)/settings/security/actions';

const id = 'fixture-account';
const factor = { id: 'fixture-factor', factor_type: 'totp', status: 'verified' };
let aal: string;
let factors: typeof factor[];
let token: string;
beforeEach(() => {
  vi.resetAllMocks();
  aal = 'aal1';
  factors = [factor];
  token = 'fixture-before';
  mocks.client.mockResolvedValue({ auth: {
    getSession: mocks.getSession, getUser: mocks.getUser, getClaims: mocks.getClaims,
    updateUser: mocks.updateUser,
    mfa: { challenge: mocks.challenge, verify: mocks.verify, enroll: mocks.enroll, unenroll: mocks.unenroll },
  } });
  // AAL and factors in local cookie user are intentionally forged.
  mocks.getSession.mockImplementation(async () => ({ data: { session: {
    access_token: token, user: { id: 'forged', factors: [], aal: 'aal2' },
  } }, error: null }));
  mocks.getUser.mockImplementation(async () => ({ data: { user: { id, factors, email: 'fixture@example.test' } }, error: null }));
  mocks.getClaims.mockImplementation(async () => ({ data: { claims: { sub: id, aal } }, error: null }));
  mocks.challenge.mockResolvedValue({ data: { id: 'challenge-id' }, error: null });
  mocks.verify.mockImplementation(async () => {
    aal = 'aal2'; token = 'fixture-after'; factors = [factor];
    return { data: {}, error: null };
  });
  mocks.limit.mockResolvedValue({ allowed: true, retryAfter: 0, unavailable: false });
  mocks.enroll.mockResolvedValue({ data: { id: factor.id, totp: { qr_code: 'fixture-qr', secret: 'fixture-secret' } }, error: null });
  mocks.unenroll.mockResolvedValue({ error: null });
  mocks.reauth.mockResolvedValue({ ok: true });
  mocks.password.mockResolvedValue({ valid: true });
  mocks.updateUser.mockResolvedValue({ data: { user: { id } }, error: null });
});
function form(code = '123456', next = '/admin') {
  const data = new FormData();
  data.set('code', code); data.set('redirect', next);
  return data;
}
function target(error: string, next = '/admin') {
  return 'redirect:/login/two-factor?' + new URLSearchParams({ error, redirect: next });
}
function noFactorWork() {
  expect(mocks.challenge).not.toHaveBeenCalled();
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
}
describe('MFA challenge', () => {
  it('requires confirmed AAL2 after TOTP and preserves the validated return destination', async () => {
    await expect(verifyMfaChallengeAction(form())).rejects.toThrow('redirect:/admin');
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(id);
    expect(mocks.getUser).toHaveBeenNthCalledWith(1, 'fixture-before');
    expect(mocks.getClaims).toHaveBeenNthCalledWith(1, 'fixture-before');
    expect(mocks.getUser).toHaveBeenNthCalledWith(2, 'fixture-after');
    expect(mocks.getClaims).toHaveBeenNthCalledWith(2, 'fixture-after');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.mfa_challenge_succeeded', userId: id }));
  });
  it('rejects recovery without consuming a code, granting access or logging success', async () => {
    await expect(verifyMfaChallengeAction(form('ABCDE-FGHJK'))).rejects.toThrow(target('recovery_unavailable'));
    noFactorWork();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each(['', '12345', '1234567', '1'.repeat(10000)])('rejects malformed or oversized code %s', async (code) => {
    await expect(verifyMfaChallengeAction(form(code))).rejects.toThrow(target('invalid_code'));
    noFactorWork();
  });
  it.each([
    { allowed: false, retryAfter: 15, unavailable: false, error: 'rate_limited' },
    { allowed: false, retryAfter: 300, unavailable: true, error: 'verification_unavailable' },
  ])('does not contact challenge when limit returns $error', async ({ error, ...result }) => {
    mocks.limit.mockResolvedValue(result);
    await expect(verifyMfaChallengeAction(form())).rejects.toThrow(target(error));
    noFactorWork();
  });
  it('refuses invalid signed claims before limiter or MFA', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'other', aal: 'aal2' } }, error: null });
    await expect(verifyMfaChallengeAction(form())).rejects.toThrow(target('verification_unavailable'));
    noFactorWork(); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it('does not accept a successful SDK call that left the session at AAL1', async () => {
    mocks.verify.mockResolvedValue({ data: {}, error: null });
    await expect(verifyMfaChallengeAction(form())).rejects.toThrow(target('verification_unavailable'));
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('rejects a changed identity after verification', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id, factors } }, error: null })
      .mockResolvedValue({ data: { user: { id: 'other', factors } }, error: null });
    await expect(verifyMfaChallengeAction(form())).rejects.toThrow(target('verification_unavailable'));
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('logs a rejected TOTP without the code or raw service error', async () => {
    mocks.verify.mockResolvedValue({ error: { message: 'secret from transport' } });
    await expect(verifyMfaChallengeAction(form())).rejects.toThrow(target('invalid_code'));
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({
      action: 'auth.mfa_challenge_failed', tenantId: null, userId: id,
      metadata: { method: 'totp', stage: 'verify' },
    });
  });
  it('handles an unavailable challenge service without a success event', async () => {
    mocks.challenge.mockRejectedValue(new Error('unavailable'));
    await expect(verifyMfaChallengeAction(form())).rejects.toThrow(target('verification_unavailable'));
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('rejects external return destinations on errors as well as success', async () => {
    await expect(verifyMfaChallengeAction(form('ABCDE-FGHJK', 'https://outside.example.test'))).rejects.toThrow(target('recovery_unavailable', '/dashboard'));
  });
  it('does not let unauthenticated callers probe or consume codes', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(verifyMfaChallengeAction(form())).rejects.toThrow('redirect:/login');
    noFactorWork(); expect(mocks.limit).not.toHaveBeenCalled();
  });
});
describe('TOTP enrollment boundary', () => {
  beforeEach(() => { factors = [{ ...factor, status: 'unverified' }]; });
  it('confirms an owned pending factor and AAL2 without creating unusable recovery codes', async () => {
    await expect(verifyTotpEnrollmentAction(factor.id, '123456')).resolves.toEqual({ ok: true });
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(id);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.mfa_enrolled', userId: id }));
  });
  it('denies another user’s factor before challenge or verification', async () => {
    await expect(verifyTotpEnrollmentAction('foreign-factor', '123456')).resolves.toEqual({ ok: false, error: 'verify_failed' });
    noFactorWork();
  });
  it('requires the existing second factor before adding another one', async () => {
    factors = [factor];
    await expect(enrollTotpAction()).resolves.toEqual({ ok: false, error: 'mfa_required' });
    await expect(verifyTotpEnrollmentAction(factor.id, '123456')).resolves.toEqual({ ok: false, error: 'mfa_required' });
    noFactorWork(); expect(mocks.enroll).not.toHaveBeenCalled(); expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it.each([false, true])('applies the same shared limiter to enrollment and verification (unavailable=%s)', async (unavailable) => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfter: 300, unavailable });
    const expected = { ok: false, error: unavailable ? 'verification_unavailable' : 'rate_limited' };
    await expect(enrollTotpAction()).resolves.toEqual(expected);
    await expect(verifyTotpEnrollmentAction(factor.id, '123456')).resolves.toEqual(expected);
    expect(mocks.limit.mock.calls.map(([userId]) => userId)).toEqual([id, id]);
    noFactorWork(); expect(mocks.enroll).not.toHaveBeenCalled(); expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it('stops enrollment if cleanup of the owned pending factor fails', async () => {
    mocks.unenroll.mockResolvedValue({ error: { message: 'denied' } });
    await expect(enrollTotpAction()).resolves.toEqual({ ok: false, error: 'enroll_failed' });
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it('never treats a successful verify response without AAL2 as completed enrollment', async () => {
    mocks.verify.mockResolvedValue({ error: null });
    await expect(verifyTotpEnrollmentAction(factor.id, '123456')).resolves.toEqual({ ok: false, error: 'verification_unavailable' });
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
});
describe('password changes', () => {
  function passwords() {
    const data = new FormData();
    data.set('current_password', 'fixture-current'); data.set('new_password', 'fixture-new');
    return data;
  }
  it('does not use a correct password as a substitute for an enrolled second factor', async () => {
    await expect(changePasswordAction(passwords())).resolves.toEqual({ ok: false, error: 'mfa_required' });
    expect(mocks.reauth).not.toHaveBeenCalled(); expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('blocks unverifiable sessions before password reauthentication', async () => {
    mocks.getClaims.mockRejectedValue(new Error('offline'));
    await expect(changePasswordAction(passwords())).resolves.toEqual({ ok: false, error: 'verification_unavailable' });
    expect(mocks.reauth).not.toHaveBeenCalled(); expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it.each(['aal2', 'no-factor'])('preserves password changes for authorized %s sessions', async (state) => {
    if (state === 'no-factor') factors = []; else aal = 'aal2';
    await expect(changePasswordAction(passwords())).resolves.toEqual({ ok: true });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'fixture-new', current_password: 'fixture-current' });
  });
});
