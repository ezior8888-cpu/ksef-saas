import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVerifiedMfaState } from '@/lib/auth/verified-mfa';

const auth = { getSession: vi.fn(), getUser: vi.fn(), getClaims: vi.fn() };
const userId = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-token', user: { factors: [] } } }, error: null,
  });
});

async function stateFor(aal: 'aal1' | 'aal2', factors?: { factor_type: string; status: string }[]) {
  auth.getUser.mockResolvedValue({ data: { user: { id: userId, factors } }, error: null });
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: userId, aal } }, error: null });
  return getVerifiedMfaState({ auth });
}

describe('verified MFA factor policy', () => {
  it.each(['totp', 'phone', 'webauthn'])('requires a challenge for AAL1 with a verified %s factor', async (factor_type) => {
    const state = await stateFor('aal1', [{ factor_type, status: 'verified' }]);
    expect(state.status).toBe('challenge_required');
    expect(auth.getUser).toHaveBeenCalledExactlyOnceWith('synthetic-token');
    expect(auth.getClaims).toHaveBeenCalledExactlyOnceWith('synthetic-token');
  });

  it.each(['phone', 'webauthn'])('does not grant the TOTP-only admin state to AAL2 with %s', async (factor_type) => {
    expect((await stateFor('aal2', [{ factor_type, status: 'verified' }])).status).toBe('enrollment_required');
  });

  it('requires the existing phone factor before enrolling a pending TOTP factor', async () => {
    expect((await stateFor('aal1', [
      { factor_type: 'phone', status: 'verified' },
      { factor_type: 'totp', status: 'unverified' },
    ])).status).toBe('challenge_required');
  });

  it('grants the verified state only after TOTP and AAL2', async () => {
    expect((await stateFor('aal2', [{ factor_type: 'totp', status: 'verified' }])).status).toBe('verified');
  });

  it.each([undefined, [], [{ factor_type: 'totp', status: 'unverified' }], [{ factor_type: 'phone', status: 'unverified' }]])(
    'preserves optional MFA for AAL1 without any verified factor: %j',
    async (factors) => {
      expect((await stateFor('aal1', factors)).status).toBe('enrollment_required');
    },
  );

  it('does not retain the verified state after all factors are removed', async () => {
    expect((await stateFor('aal2', [])).status).toBe('enrollment_required');
  });
});
