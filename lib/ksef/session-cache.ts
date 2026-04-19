import type { KsefAuthSession, KsefCredentials } from './auth';
import { authenticateWithXades } from './auth';
import type { KsefEnvironment } from '@/types/ksef';

/**
 * In-memory cache sesji KSeF per NIP.
 * Refreshuje sesję 5 minut przed wygaśnięciem accessToken.
 *
 * UWAGA: in-memory - nie współdzielone między instancjami Vercel.
 * Dla produkcji zastąp Upstash Redis / tabelą ksef_sessions w Supabase.
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
    credentials: KsefCredentials,
    env?: KsefEnvironment
  ): Promise<KsefAuthSession> {
    const cacheKey = `${env ?? 'test'}:${credentials.nip}`;

    // 1. Sprawdź cache
    const cached = this.sessions.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      return cached;
    }

    // 2. Sprawdź lock (ktoś już robi auth flow)
    const existingLock = this.locks.get(cacheKey);
    if (existingLock) {
      return existingLock;
    }

    // 3. Rozpocznij nowy auth flow pod lockiem
    const authPromise = this.doAuth(cacheKey, credentials, env);
    this.locks.set(cacheKey, authPromise);

    try {
      return await authPromise;
    } finally {
      this.locks.delete(cacheKey);
    }
  }

  private async doAuth(
    cacheKey: string,
    credentials: KsefCredentials,
    env?: KsefEnvironment
  ): Promise<KsefAuthSession> {
    const session = await authenticateWithXades(credentials, env);
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
