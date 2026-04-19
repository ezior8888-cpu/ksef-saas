import { ksefFetch } from './client';
import { encryptKsefToken } from './encryption';
import type {
  AuthChallengeResponse,
  AuthStatusResponse,
  AccessTokenResponse,
  KsefEnvironment,
} from '@/types/ksef';
import type { KsefAuthSession } from './auth';

/**
 * Odpowiedź /auth/ksef-token = identyczny kształt jak /auth/xades-signature.
 * Zwraca referenceNumber do pollowania + authenticationToken (tymczasowy).
 */
interface AuthenticationInitResponse {
  referenceNumber: string;
  authenticationToken: {
    token: string;
    validUntil: string;
  };
}

export interface KsefTokenCredentials {
  /** NIP kontekstu - musi pasować do kontekstu, w którym wygenerowano token */
  nip: string;
  /** Długi string tokena wygenerowany w portalu ap-test.ksef.mf.gov.pl */
  token: string;
}

/** Krok 1: pobierz challenge + timestampMs. */
async function fetchChallenge(env?: KsefEnvironment): Promise<AuthChallengeResponse> {
  return ksefFetch<AuthChallengeResponse>('/auth/challenge', { method: 'POST', env });
}

/**
 * Krok 2-3: zaszyfruj `token|timestampMs` kluczem publicznym MF (RSA-OAEP-SHA256)
 * i wyślij do /auth/ksef-token.
 */
async function submitKsefTokenAuth(
  challenge: AuthChallengeResponse,
  credentials: KsefTokenCredentials,
  env?: KsefEnvironment
): Promise<AuthenticationInitResponse> {
  const plaintext = `${credentials.token}|${challenge.timestampMs}`;
  const encryptedToken = await encryptKsefToken(plaintext);

  return ksefFetch<AuthenticationInitResponse>('/auth/ksef-token', {
    method: 'POST',
    body: {
      challenge: challenge.challenge,
      contextIdentifier: { type: 'Nip', value: credentials.nip },
      encryptedToken,
    },
    env,
  });
}

/** Krok 4: polling aż status = 200 (zaakceptowane). */
async function pollAuthStatus(
  referenceNumber: string,
  authenticationToken: string,
  env?: KsefEnvironment,
  maxAttempts = 20,
  intervalMs = 1000
): Promise<AuthStatusResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await ksefFetch<AuthStatusResponse>(`/auth/${referenceNumber}`, {
      accessToken: authenticationToken,
      env,
    });

    if (status.status.code === 200) return status;
    if (status.status.code >= 400) {
      throw new Error(`KSeF auth failed: ${status.status.description}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`KSeF auth polling timed out after ${maxAttempts} attempts`);
}

/** Krok 5: wymień authenticationToken na accessToken + refreshToken. */
async function redeemAuthToken(
  authenticationToken: string,
  env?: KsefEnvironment
): Promise<AccessTokenResponse> {
  return ksefFetch<AccessTokenResponse>('/auth/token/redeem', {
    method: 'POST',
    accessToken: authenticationToken,
    env,
  });
}

/**
 * GŁÓWNA FUNKCJA: pełny flow autentykacji tokenem KSeF.
 * Zwraca sesję (accessToken + refreshToken + ważność).
 *
 * Flow:
 *   1. POST /auth/challenge         → challenge + timestampMs
 *   2. encrypt(`${token}|${ts}`)    → RSA-OAEP-SHA256
 *   3. POST /auth/ksef-token        → referenceNumber + authenticationToken
 *   4. poll GET /auth/{ref}         → aż status.code === 200
 *   5. POST /auth/token/redeem      → accessToken (Bearer) + refreshToken
 */
export async function authenticateWithToken(
  credentials: KsefTokenCredentials,
  env?: KsefEnvironment
): Promise<KsefAuthSession> {
  const challenge = await fetchChallenge(env);
  const { referenceNumber, authenticationToken } = await submitKsefTokenAuth(
    challenge,
    credentials,
    env
  );
  await pollAuthStatus(referenceNumber, authenticationToken.token, env);
  const tokens = await redeemAuthToken(authenticationToken.token, env);

  return {
    accessToken: tokens.accessToken.token,
    refreshToken: tokens.refreshToken.token,
    accessTokenExpiresAt: new Date(tokens.accessToken.validUntil).getTime(),
    refreshTokenExpiresAt: new Date(tokens.refreshToken.validUntil).getTime(),
    nip: credentials.nip,
  };
}
