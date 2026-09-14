import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(), getSession: vi.fn(), getUser: vi.fn(), getClaims: vi.fn(),
  limit: vi.fn(), reauth: vi.fn(), generate: vi.fn(), remove: vi.fn(), audit: vi.fn(),
  factors: vi.fn(), unenroll: vi.fn(), enroll: vi.fn(), challenge: vi.fn(), verify: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/auth/reauth', () => ({ reauthenticateWithPassword: mocks.reauth }));
vi.mock('@/lib/auth/mfa-recovery', () => ({
  generateAndStoreRecoveryCodes: mocks.generate, deleteAllRecoveryCodes: mocks.remove,
}));
vi.mock('@/lib/rate-limit/mfa', () => ({ checkMfaRateLimit: mocks.limit }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('@/lib/auth/password', () => ({ validatePassword: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  enrollTotpAction, regenerateRecoveryCodesAction, unenrollTotpAction,
} from '@/app/(dashboard)/settings/security/actions';

const user = { id: 'user-fixture', email: 'member@example.test',
  factors: [{ id: 'factor-fixture', factor_type: 'totp', status: 'verified' }] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({ auth: {
    getSession: mocks.getSession, getUser: mocks.getUser, getClaims: mocks.getClaims,
    mfa: { listFactors: mocks.factors, unenroll: mocks.unenroll, enroll: mocks.enroll,
      challenge: mocks.challenge, verify: mocks.verify },
  } });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'fixture-token' } }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: structuredClone(user) }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: user.id, aal: 'aal2' } }, error: null });
  mocks.reauth.mockResolvedValue({ ok: true });
  mocks.limit.mockResolvedValue({ allowed: true, retryAfter: 0, unavailable: false });
  mocks.factors.mockResolvedValue({ data: { all: user.factors, totp: user.factors }, error: null });
  mocks.unenroll.mockResolvedValue({ error: null });
  mocks.generate.mockResolvedValue(['synthetic-code']);
  mocks.remove.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe.each([
  { name: 'regenerate recovery codes', run: () => regenerateRecoveryCodesAction('fixture-password') },
  { name: 'disable TOTP', run: () => unenrollTotpAction('fixture-password') },
])('$name', ({ name, run }) => {
  function expectNoSensitiveWork() {
    expect(mocks.reauth).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.unenroll).not.toHaveBeenCalled();
  }
  it('requires MFA at the action even if invoked directly with a correct password', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: user.id, aal: 'aal1' } }, error: null });
    await expect(run()).resolves.toEqual({ ok: false, error: 'mfa_required' });
    expectNoSensitiveWork();
  });
  it('rejects missing authentication', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(run()).resolves.toEqual({ ok: false, error: 'not_authenticated' });
    expectNoSensitiveWork();
  });
  it('fails closed when signed claims cannot be checked', async () => {
    mocks.getClaims.mockRejectedValue(new Error('fixture failure'));
    await expect(run()).resolves.toEqual({ ok: false, error: 'mfa_required' });
    expectNoSensitiveWork();
  });
  it('rejects a removed TOTP factor even if the session still says AAL2', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...user, factors: [] } }, error: null });
    await expect(run()).resolves.toEqual({ ok: false, error: 'mfa_required' });
    expectNoSensitiveWork();
  });
  it('still requires the correct password after verified MFA', async () => {
    mocks.reauth.mockResolvedValue({ ok: false });
    await expect(run()).resolves.toEqual({ ok: false, error: name === 'regenerate recovery codes' ? 'recovery_unavailable' : 'invalid_password' });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it('waits for verification before any sensitive work', async () => {
    let resolve!: (value: object) => void;
    mocks.getClaims.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = run();
    await vi.waitFor(() => expect(mocks.getClaims).toHaveBeenCalledOnce());
    expectNoSensitiveWork();
    resolve({ data: { claims: { sub: user.id, aal: 'aal2' } }, error: null });
    await expect(pending).resolves.toMatchObject(name === 'regenerate recovery codes' ? { ok: false, error: 'recovery_unavailable' } : { ok: true });
  });
});

it('does not generate unusable codes even for an authenticated MFA user', async () => {
  await expect(regenerateRecoveryCodesAction('fixture-password')).resolves.toEqual({ ok: false, error: 'recovery_unavailable' });
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.reauth).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});
it('does not report disabled MFA when factor listing fails', async () => {
  mocks.factors.mockResolvedValue({ data: null, error: { message: 'fixture failure' } });
  await expect(unenrollTotpAction('fixture-password')).resolves.toEqual({ ok: false, error: 'unenroll_failed' });
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});
it('retains initial enrollment from AAL1 with no factor', async () => {
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: user.id, aal: 'aal1' } }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { ...user, factors: [] } }, error: null });
  mocks.factors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
  mocks.enroll.mockResolvedValue({ data: { id: 'new-factor', totp: { qr_code: 'synthetic-qr', secret: 'synthetic-enrollment-fixture' } }, error: null });
  await expect(enrollTotpAction()).resolves.toMatchObject({ ok: true, factorId: 'new-factor' });
});
