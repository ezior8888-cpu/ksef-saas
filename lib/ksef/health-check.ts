/**
 * Sprawdza dostępność KSeF API z timeoutem (prosty GET — endpoint weryfikować
 * w dokumentacji MF: `/health` vs `/status`).
 */

import { getKsefApiUrl } from './client';
import type { KsefEnvironment } from '@/types/ksef';

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
  const healthEndpoint = `${apiUrl.replace(/\/+$/, '')}/health`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(healthEndpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return { available: true, responseTime };
    }

    return {
      available: false,
      responseTime,
      error: `KSeF returned ${response.status}`,
      isMfOutage: response.status === 503,
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
