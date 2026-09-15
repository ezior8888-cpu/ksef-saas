import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(), getSession: vi.fn(), getUser: vi.fn(), getClaims: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import { getAdminContext, requireAdmin } from '@/lib/auth/admin-guard';
import { getVerifiedMfaState } from '@/lib/auth/verified-mfa';

const token = 'synthetic-access-token';
const operator = {
  id: 'operator-fixture', email: 'operator@example.test',
  email_confirmed_at: '2026-09-14T00:00:00Z',
  factors: [{ id: 'totp-fixture', factor_type: 'totp', status: 'verified' }],
};
const auth = {
  getSession: mocks.getSession, getUser: mocks.getUser, getClaims: mocks.getClaims,
};
const client = { auth };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_EMAILS', ' Operator@example.test ');
  mocks.client.mockResolvedValue(client);
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: token, user: { id: 'forged-cookie-user', factors: [] } } },
    error: null,
  });
  mocks.getUser.mockResolvedValue({ data: { user: structuredClone(operator) }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: operator.id, aal: 'aal2' } }, error: null });
  mocks.redirect.mockImplementation((url: string) => { throw new Error('redirect:' + url); });
});
afterEach(() => vi.unstubAllEnvs());

describe('administrator MFA boundary', () => {
  it('binds authoritative identity and signed AAL to the same token, ignoring cookie user', async () => {
    await expect(requireAdmin()).resolves.toEqual({ userId: operator.id, email: operator.email });
    expect(mocks.getUser).toHaveBeenCalledWith(token);
    expect(mocks.getClaims).toHaveBeenCalledWith(token);
  });
  it('returns a UI context only for a verified operator', async () => {
    await expect(getAdminContext()).resolves.toEqual({ userId: operator.id, email: operator.email });
  });
  it('denies a missing token without using user data from the cookie', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: operator } }, error: null });
    await expect(requireAdmin()).rejects.toThrow('redirect:/login?error=admin_required');
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
  it.each([
    { user: null, error: null },
    { user: operator, error: { message: 'invalid token' } },
  ])('denies failed authoritative identity: %j', async ({ user, error }) => {
    mocks.getUser.mockResolvedValue({ data: { user }, error });
    await expect(requireAdmin()).rejects.toThrow('redirect:/login?error=admin_required');
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
  it.each([
    { sub: 'another-user', aal: 'aal2' },
    { sub: operator.id, aal: undefined },
    { sub: operator.id, aal: 'aal3' },
  ])('denies invalid claims: %j', async (claims) => {
    mocks.getClaims.mockResolvedValue({ data: { claims }, error: null });
    await expect(requireAdmin()).rejects.toThrow(/mfa_(claims|assurance)_invalid/);
    await expect(getAdminContext()).resolves.toBeNull();
  });
  it.each([
    { data: null, error: { message: 'bad signature' } },
    { data: null, error: null },
    { data: { claims: { sub: operator.id, aal: 'aal2' } }, error: { message: 'expired' } },
  ])('does not use claims when verification fails: %j', async (result) => {
    mocks.getClaims.mockResolvedValue(result);
    await expect(requireAdmin()).rejects.toThrow('mfa_claims_invalid');
  });
  it.each(['getSession', 'getUser', 'getClaims'] as const)('fails closed if %s throws', async (method) => {
    mocks[method].mockRejectedValue(new Error('unavailable'));
    await expect(requireAdmin()).rejects.toThrow('unavailable');
    await expect(getAdminContext()).resolves.toBeNull();
  });
  it('fails closed on a session read error', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'unavailable' } });
    await expect(requireAdmin()).rejects.toThrow('mfa_session_unavailable');
  });
  it.each([
    { email: 'member@example.test', email_confirmed_at: operator.email_confirmed_at },
    { email: operator.email, email_confirmed_at: undefined },
    { email: undefined, email_confirmed_at: operator.email_confirmed_at },
  ])('requires current allowlist membership and confirmed email: %j', async (fields) => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...operator, ...fields } }, error: null });
    await expect(requireAdmin()).rejects.toThrow('redirect:/dashboard');
    await expect(getAdminContext()).resolves.toBeNull();
  });
  it('re-evaluates the allowlist on the next operation', async () => {
    await requireAdmin();
    vi.stubEnv('ADMIN_EMAILS', '');
    await expect(requireAdmin()).rejects.toThrow('redirect:/dashboard');
  });
  it('directs AAL1 with TOTP to a challenge without granting admin context', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: operator.id, aal: 'aal1' } }, error: null });
    await expect(requireAdmin()).rejects.toThrow('redirect:/login/two-factor?redirect=%2Fadmin');
    await expect(getAdminContext()).resolves.toBeNull();
  });
  it.each([undefined, [], [{ factor_type: 'totp', status: 'unverified' }], [{ factor_type: 'phone', status: 'verified' }]])(
    'requires an active supported factor even with an old AAL2 token: %j', async (factors) => {
      mocks.getUser.mockResolvedValue({ data: { user: { ...operator, factors } }, error: null });
      await expect(requireAdmin()).rejects.toThrow('redirect:/login/two-factor/setup');
      await expect(getAdminContext()).resolves.toBeNull();
    },
  );
  it('keeps first enrollment distinct from an authenticated TOTP session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...operator, factors: [] } }, error: null });
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: operator.id, aal: 'aal1' } }, error: null });
    // The helper is called with the real client shape in production.
    await expect(getVerifiedMfaState(client))
      .resolves.toMatchObject({ status: 'enrollment_required', user: { id: operator.id } });
  });
});
