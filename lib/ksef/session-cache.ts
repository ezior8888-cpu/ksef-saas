import { createHash } from 'node:crypto';
import type { KsefAuth, KsefAuthSession } from './auth';
import { authenticateWithXades } from './auth';
import { authenticateWithToken } from './auth-token';
import type { KsefEnvironment } from '@/types/ksef';
import { getTenantKsefCredentials } from '@/lib/supabase/admin-queries';
import { requireMatchingKsefEnvironment } from './claim-environment';

/**
 * In-memory cache sesji KSeF per (environment, NIP, fingerprint poświadczeń).
 * Refreshuje sesję 5 minut przed wygaśnięciem accessToken.
 *
 * Cache jest lokalny dla procesu workera. Nowy certyfikat lub token pobrany
 * z bazy wymusza ponowną autoryzację, nawet gdy NIP pozostał ten sam.
 *
 * Wspiera oba typy auth z `KsefAuth` (XAdES-BES cert + token KSeF).
 * Consumer dostarcza credentials, cache dispatcha na odpowiedni flow wg
 * `auth.type`.
 */
interface CachedSession {
  fingerprint: string;
  session: KsefAuthSession;
}

interface PendingAuth {
  fingerprint: string;
  promise: Promise<KsefAuthSession>;
}

function fingerprintPart(hash: ReturnType<typeof createHash>, value: string): void {
  hash.update(String(Buffer.byteLength(value, 'utf8'))).update(':').update(value);
}

function credentialFingerprint(auth: KsefAuth): string {
  const hash = createHash('sha256');
  fingerprintPart(hash, auth.type);
  if (auth.type === 'xades') {
    fingerprintPart(hash, auth.certificatePem);
    fingerprintPart(hash, auth.privateKeyPem);
  } else {
    fingerprintPart(hash, auth.token);
  }
  return hash.digest('hex');
}

class SessionCache {
  private sessions = new Map<string, CachedSession>();
  private locks = new Map<string, PendingAuth>();

  /**
   * Buffer bezpieczeństwa - odświeżamy sesję 5 min przed expiry.
   */
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  private isExpired(session: KsefAuthSession): boolean {
    return session.accessTokenExpiresAt - this.REFRESH_BUFFER_MS < Date.now();
  }

  /**
   * Pobiera sesję dla NIP. Autentykuje lub odświeża jeśli trzeba.
   * Równoległe żądania z tymi samymi poświadczeniami współdzielą auth flow.
   * Rotacja poświadczeń nie może dołączyć do auth flow starym certyfikatem.
   */
  async getSession(
    auth: KsefAuth,
    env?: KsefEnvironment,
  ): Promise<KsefAuthSession> {
    const cacheKey = `${env ?? 'test'}:${auth.nip}`;
    const fingerprint = credentialFingerprint(auth);

    const cached = this.sessions.get(cacheKey);
    if (cached?.fingerprint === fingerprint && !this.isExpired(cached.session)) {
      return cached.session;
    }
    this.sessions.delete(cacheKey);

    const existingLock = this.locks.get(cacheKey);
    if (existingLock?.fingerprint === fingerprint) {
      return existingLock.promise;
    }

    const authPromise = this.doAuth(auth, env);
    const pending: PendingAuth = { fingerprint, promise: authPromise };
    this.locks.set(cacheKey, pending);

    try {
      const session = await authPromise;
      // A slower old auth flow must not overwrite a newer credential's session.
      if (this.locks.get(cacheKey) === pending) {
        this.sessions.set(cacheKey, { fingerprint, session });
      }
      return session;
    } finally {
      if (this.locks.get(cacheKey) === pending) {
        this.locks.delete(cacheKey);
      }
    }
  }

  private async doAuth(
    auth: KsefAuth,
    env?: KsefEnvironment,
  ): Promise<KsefAuthSession> {
    // Dispatch po discriminatorze. Exhaustiveness check przez `satisfies never`
    // w default - kompilator złapie brakujący case, gdy dojdzie trzeci typ auth.
    let session: KsefAuthSession;
    switch (auth.type) {
      case 'xades':
        session = await authenticateWithXades(auth, env);
        break;
      case 'token':
        session = await authenticateWithToken(auth, env);
        break;
      default: {
        const _exhaustive: never = auth;
        void _exhaustive;
        throw new Error('Unknown KSeF authentication type');
      }
    }
    return session;
  }

  /**
   * Ręczne wyczyszczenie sesji (np. po 401 z API).
   */
  invalidate(nip: string, env?: KsefEnvironment): void {
    const cacheKey = `${env ?? 'test'}:${nip}`;
    this.sessions.delete(cacheKey);
    // An in-flight auth may have been invalidated after a 401. Do not reuse
    // its promise or let it repopulate the cache when it eventually resolves.
    this.locks.delete(cacheKey);
  }
}

export const ksefSessionCache = new SessionCache();

/**
 * Ładuje credentials tenanta (service role) i zwraca aktywną sesję KSeF.
 * Używane przez joby serwerowe (np. historia faktur). Zwraca `null` gdy brak certyfikatu/tokena.
 */
export async function getValidSession(
  tenantId: string,
  env?: KsefEnvironment,
): Promise<{ auth: KsefAuth; session: KsefAuthSession } | null> {
  try {
    const configuredEnv = requireMatchingKsefEnvironment(env);
    const auth = await getTenantKsefCredentials(tenantId);
    const session = await ksefSessionCache.getSession(auth, configuredEnv);
    return { auth, session };
  } catch {
    return null;
  }
}
