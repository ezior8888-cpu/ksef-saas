import { describe, expect, it } from 'vitest';
import type { KsefAuthSession } from '@/lib/ksef/auth';
import { hasFreshKsefOwnerProof } from '@/lib/ksef/owner-claim';

function session(per: unknown, overrides: Partial<KsefAuthSession> = {}): KsefAuthSession {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    accessToken: 'header.' + Buffer.from(JSON.stringify({ per, exp })).toString('base64url') + '.signature',
    refreshToken: 'fixture',
    accessTokenExpiresAt: (exp - 60) * 1000,
    refreshTokenExpiresAt: (exp + 3600) * 1000,
    nip: '1234567890',
    ...overrides,
  };
}

describe('fresh KSeF Owner proof from server-side redeemed session', () => {
  it.each(['Owner', ['InvoiceRead', 'Owner'], '["Owner","InvoiceRead"]'])('accepts exact Owner in supported per shape %s', (per) => {
    expect(hasFreshKsefOwnerProof(session(per), '1234567890')).toBe(true);
  });

  it.each(['InvoiceRead', 'CredentialsManage', 'OwnerDelegate', ['InvoiceRead'], null, { role: 'Owner' }])('rejects non-owner per %s', (per) => {
    expect(hasFreshKsefOwnerProof(session(per), '1234567890')).toBe(false);
  });

  it('rejects wrong NIP, missing token, expired session, and malformed claims', () => {
    expect(hasFreshKsefOwnerProof(session('Owner', { nip: '9999999999' }), '1234567890')).toBe(false);
    expect(hasFreshKsefOwnerProof(session('Owner', { accessToken: '' }), '1234567890')).toBe(false);
    expect(hasFreshKsefOwnerProof(session('Owner', { accessTokenExpiresAt: Date.now() - 1 }), '1234567890')).toBe(false);
    const malformed = session('Owner');
    malformed.accessToken = 'header.' + Buffer.from(JSON.stringify({ per: 'Owner', exp: 0 })).toString('base64url') + '.signature';
    expect(hasFreshKsefOwnerProof(malformed, '1234567890')).toBe(false);
  });
});
