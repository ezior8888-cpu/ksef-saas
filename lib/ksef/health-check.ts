/**
 * Sprawdza dostępność KSeF API z timeoutem.
 *
 * KSeF 2.0 nie ma publicznego endpointu zdrowia: `GET /v2/health` odpowiada
 * 401 na TEST i PROD (sprawdzone 01.10.2026), a dokumentacja MF
 * (CIRFMF/ksef-api) żadnego endpointu stanu nie opisuje. Wcześniejsza sonda
 * pytała właśnie o `/health`, więc monitor tygodniami zgłaszał „down”, a każda
 * wysyłka z certyfikatem XAdES trafiała do Offline24 zamiast do KSeF.
 *
 * Sondujemy publiczny, udokumentowany `GET /security/public-key-certificates`
 * — bez logowania, lekki, i potrzebny do szyfrowania każdej sesji, więc jego
 * dostępność realnie oznacza „da się wysłać fakturę”.
 */

import { getKsefApiUrl } from './client';
import type { KsefEnvironment } from '@/types/ksef';

export const KSEF_HEALTH_PROBE_PATH = '/security/public-key-certificates';

export interface KsefHealthResult {
  available: boolean;
  responseTime?: number;
  error?: string;
  /** Czy prawdopodobnie globalna awaria usługi po stronie MF (np. HTTP 503). */
  isMfOutage?: boolean;
}

const TIMEOUT_MS = 5000;

export async function checkKsefAvailability(
  env?: KsefEnvironment,
): Promise<KsefHealthResult> {
  const startTime = Date.now();
  const apiUrl = getKsefApiUrl(env);
  const probeUrl = `${apiUrl.replace(/\/+$/, '')}${KSEF_HEALTH_PROBE_PATH}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(probeUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    // Treść certyfikatów nie jest potrzebna — zwalniamy połączenie od razu.
    await response.body?.cancel().catch(() => undefined);

    if (response.ok) {
      return { available: true, responseTime };
    }

    // 5xx i 429 to sygnał po stronie MF — zachowanie jak dotąd (Offline24 / rate limit).
    if (response.status >= 500 || response.status === 429) {
      return {
        available: false,
        responseTime,
        error: `KSeF returned ${response.status}`,
        isMfOutage: response.status === 503,
      };
    }

    // Inne 4xx: serwer KSeF odpowiedział, więc jest osiągalny — zła odpowiedź
    // sondy (np. MF przeniósł endpoint) nie może przełączać faktur w Offline24.
    // Błąd zostaje w snapshocie, żeby operator zobaczył go w `ksef_health_log`.
    return {
      available: true,
      responseTime,
      error: `Sonda zdrowia KSeF dostała HTTP ${response.status} — sprawdź KSEF_HEALTH_PROBE_PATH`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        available: false,
        error: 'Request aborted (timeout)',
        isMfOutage: false,
      };
    }
    const message = error instanceof Error ? error.message : 'Unknown';
    return {
      available: false,
      error: message,
      isMfOutage: false,
    };
  }
}

// ============================================================================
// Helper: czy powinniśmy włączyć tryb offline?
// ============================================================================

export async function shouldUseOfflineMode(
  env?: KsefEnvironment,
): Promise<{
  offline: boolean;
  reason: 'ksef_down' | 'network_error' | 'rate_limit' | null;
  isMfOutage: boolean;
}> {
  const health = await checkKsefAvailability(env);

  if (health.available) {
    return { offline: false, reason: null, isMfOutage: false };
  }

  const err = health.error ?? '';

  return {
    offline: true,
    reason: err.includes('429')
      ? 'rate_limit'
      : err.toLowerCase().includes('aborted') ||
          err.toLowerCase().includes('fetch') ||
          err.toLowerCase().includes('network') ||
          err.toLowerCase().includes('timeout')
        ? 'network_error'
        : 'ksef_down',
    isMfOutage: health.isMfOutage ?? false,
  };
}
