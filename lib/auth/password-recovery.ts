import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';

export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 15 * 60;
const MAX_CLOCK_SKEW_SECONDS = 30;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VerifiedPasswordRecoveryState =
  | { status: 'unauthenticated' | 'invalid' | 'expired' }
  | { status: 'challenge_required' | 'verified'; user: User; sessionId: string; accessToken: string };

type RecoveryAuth = Pick<SupabaseClient['auth'], 'getSession' | 'getUser' | 'getClaims'>;

/**
 * Only a verified PKCE recovery AMR authorizes this password-reset flow.
 * Cookie user data, redirectType, URL type/next and generic OTP sessions are
 * not proof. Auth verifies the identity and claims of the EXACT same token.
 *
 * The 15-minute window starts at the signed recovery AMR timestamp, not iat:
 * refreshing a token must not renew permission to reset the password.
 * This helper does not consume the proof; the caller must enforce one use
 * per verified sessionId and apply password validation and rate limits.
 * accessToken is for server-side operations on this verified session only;
 * never serialize the state to a client component or include it in logs.
 */
export async function getVerifiedPasswordRecoveryState(
  supabase: { auth: RecoveryAuth },
  now: () => number = Date.now,
): Promise<VerifiedPasswordRecoveryState> {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) return { status: 'invalid' };
    const token = sessionData.session?.access_token;
    if (!token) return { status: 'unauthenticated' };
    if (typeof token !== 'string') return { status: 'invalid' };

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) return { status: 'invalid' };
    const user = userData.user;
    if (!user) return { status: 'unauthenticated' };
    if (typeof user.id !== 'string' || !user.id) return { status: 'invalid' };

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData) return { status: 'invalid' };
    const claims = claimsData.claims;
    if (claims.sub !== user.id) return { status: 'invalid' };
    const sessionId = claims.session_id;
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      return { status: 'invalid' };
    }
    if (claims.aal !== 'aal1' && claims.aal !== 'aal2') return { status: 'invalid' };
    if (!Array.isArray(claims.amr)) return { status: 'invalid' };

    const nowSeconds = now() / 1000;
    if (!Number.isFinite(nowSeconds) || nowSeconds <= 0) return { status: 'invalid' };
    let latestRecovery: number | undefined;
    for (const entry of claims.amr) {
      if (typeof entry !== 'object' || entry === null || entry.method !== 'recovery') continue;
      const timestamp = entry.timestamp;
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0) continue;
      if (timestamp > nowSeconds + MAX_CLOCK_SKEW_SECONDS) continue;
      if (latestRecovery === undefined || timestamp > latestRecovery) latestRecovery = timestamp;
    }
    if (latestRecovery === undefined) return { status: 'invalid' };
    if (nowSeconds - latestRecovery >= PASSWORD_RECOVERY_MAX_AGE_SECONDS) {
      return { status: 'expired' };
    }

    // Unsupported factor types still protect the account; recovery is not MFA.
    if (claims.aal === 'aal1' && user.factors?.some((factor) => factor.status === 'verified')) {
      return { status: 'challenge_required', user, sessionId, accessToken: token };
    }
    return { status: 'verified', user, sessionId, accessToken: token };
  } catch {
    // No SDK/server messages: they can contain tokens or account information.
    return { status: 'invalid' };
  }
}
