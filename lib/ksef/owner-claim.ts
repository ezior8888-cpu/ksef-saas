import type { KsefAuthSession } from './auth';

/**
 * Parse only a freshly redeemed accessToken returned directly by our own
 * server-side XAdES exchange with KSeF. This is not a general JWT verifier:
 * never pass a browser-supplied token here or persist the token as proof.
 *
 * MF's integration test asserts that the JWT "per" claim includes "Owner".
 * It accepts a scalar, an array, or a JSON-encoded array; every other shape
 * fails closed. "CredentialsManage" and invoice permissions are not Owner.
 */
export function hasFreshKsefOwnerProof(
  session: KsefAuthSession,
  expectedNip: string,
): boolean {
  if (session.nip !== expectedNip ||
      !Number.isFinite(session.accessTokenExpiresAt) ||
      session.accessTokenExpiresAt <= Date.now()) {
    return false;
  }

  const token = session.accessToken;
  if (typeof token !== 'string' || token.length > 64 * 1024) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return false;

  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return false;
    }
    const claims = payload as Record<string, unknown>;
    if (
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp * 1000 <= Date.now()
    ) {
      return false;
    }

    let permissions: unknown = claims.per;
    if (typeof permissions === 'string' && permissions.startsWith('[')) {
      permissions = JSON.parse(permissions);
    }
    if (typeof permissions === 'string') return permissions === 'Owner';
    return (
      Array.isArray(permissions) &&
      permissions.every((permission) => typeof permission === 'string') &&
      permissions.includes('Owner')
    );
  } catch {
    return false;
  }
}