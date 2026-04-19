import type { KsefAuth, KsefAuthSession } from './auth';
import { authenticateWithXades } from './auth';
import { authenticateWithToken } from './auth-token';
import type { KsefEnvironment } from '@/types/ksef';

/**
 * In-memory cache sesji KSeF per (environment, NIP).
 * Refreshuje sesję 5 minut przed wygaśnięciem accessToken.
 *
 * UWAGA: in-memory - nie współdzielone między instancjami Vercel.
 * Dla produkcji zastąp Upstash Redis / tabelą ksef_sessions w Supabase.
 *
 * Wspiera oba typy auth z `KsefAuth` (XAdES-BES cert + token KSeF).
 * Consumer dostarcza credentials, cache dispatcha na odpowiedni flow wg
 * `auth.type`.
 */
class SessionCache {
  private sessions = new Map<string, KsefAuthSession>();
  private locks = new Map<string, Promise<KsefAuthSession>>();

  /**
   * Buffer bezpieczeństwa - odświeżamy sesję 5 min przed expiry.
   */
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  private isExpired(session: KsefAuthSession): boolean {
    return session.accessTokenExpiresAt - this.REFRESH_BUFFER_MS < Date.now();
  }

  /**
   * Pobiera sesję dla NIP. Autentykuje lub odświeża jeśli trzeba.
   *
   * Obsługa race-condition: jeśli dwa żądania jednocześnie wołają
   * getSession() dla tego samego NIP, tylko jedno faktycznie uruchamia
   * auth flow, drugie czeka na wynik.
   */
  async getSession(
    auth: KsefAuth,
    env?: KsefEnvironment,
  ): Promise<KsefAuthSession> {
    const cacheKey = `${env ?? 'test'}:${auth.nip}`;

    const cached = this.sessions.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      return cached;
    }

    const existingLock = this.locks.get(cacheKey);
    if (existingLock) {
      return existingLock;
    }

    const authPromise = this.doAuth(cacheKey, auth, env);
    this.locks.set(cacheKey, authPromise);

    try {
      return await authPromise;
    } finally {
      this.locks.delete(cacheKey);
    }
  }

  private async doAuth(
    cacheKey: string,
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
        throw new Error(`Unknown KsefAuth type: ${JSON.stringify(_exhaustive)}`);
      }
    }
    this.sessions.set(cacheKey, session);
    return session;
  }

  /**
   * Ręczne wyczyszczenie sesji (np. po 401 z API).
   */
  invalidate(nip: string, env?: KsefEnvironment): void {
    const cacheKey = `${env ?? 'test'}:${nip}`;
    this.sessions.delete(cacheKey);
  }
}

export const ksefSessionCache = new SessionCache();
