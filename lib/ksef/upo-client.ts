/**
 * Klient KSeF API do pobierania Urzędowych Poświadczeń Odbioru (UPO).
 *
 * Wymaga `service_role` (ładowanie credentials z DB) — używać wyłącznie
 * w Inngest / API routes po stronie serwera, nie w Client Components.
 */

import type { KsefEnvironment } from '@/types/ksef';

import { getTenantKsefCredentials } from '@/lib/supabase/admin-queries';

import { getKsefBaseUrl } from './client';
import { ksefRateLimiter } from './rate-limiter';
import { ksefSessionCache } from './session-cache';

const DEFAULT_TIMEOUT_MS = 30_000;

export interface UpoDownloadResult {
  success: true;
  upoXml: string;
  upoXmlHash: string; // SHA-256
  upoId?: string;
  acceptanceTimestamp: string;
}

export interface UpoDownloadError {
  success: false;
  error: string;
  errorCode?: string;
  retryable: boolean;
}

export type UpoDownloadResponse = UpoDownloadResult | UpoDownloadError;

function resolveEnv(env?: KsefEnvironment): KsefEnvironment {
  return env ?? (process.env.KSEF_ENV as KsefEnvironment) ?? 'test';
}

/**
 * Pobiera UPO z KSeF API.
 * Ścieżka względem bazy `{getKsefBaseUrl(env)}/invoices/{ksefNumber}/upo`
 * (baza kończy się na `/v2`).
 */
export async function downloadUpoFromKsef(
  tenantId: string,
  ksefNumber: string,
  opts?: {
    env?: KsefEnvironment;
    timeoutMs?: number;
  },
): Promise<UpoDownloadResponse> {
  const env = resolveEnv(opts?.env);
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    let auth;
    try {
      auth = await getTenantKsefCredentials(tenantId);
    } catch (credErr) {
      const message =
        credErr instanceof Error ? credErr.message : 'Unknown error';
      if (
        message.includes('nie ma skonfigurowanych credentials') ||
        message.includes('ksef_credentials_encrypted')
      ) {
        return {
          success: false,
          error: 'Brak aktywnej sesji KSeF — sprawdź certyfikat',
          errorCode: 'NO_CREDENTIALS',
          retryable: false,
        };
      }
      return {
        success: false,
        error: message,
        retryable: false,
      };
    }

    let session;
    try {
      session = await ksefRateLimiter.enqueue(auth.nip, () =>
        ksefSessionCache.getSession(auth, env),
      );
    } catch {
      return {
        success: false,
        error: 'Brak aktywnej sesji KSeF — sprawdź certyfikat',
        retryable: false,
      };
    }

    const baseUrl = getKsefBaseUrl(env);
    const upoEndpoint = `${baseUrl}/invoices/${encodeURIComponent(ksefNumber)}/upo`;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(upoEndpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/xml',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: 'UPO nie zostało jeszcze wygenerowane przez KSeF',
          errorCode: 'UPO_NOT_READY',
          retryable: true,
        };
      }

      if (response.status === 401) {
        ksefSessionCache.invalidate(auth.nip, env);
        return {
          success: false,
          error: 'Sesja KSeF wygasła',
          errorCode: 'SESSION_EXPIRED',
          retryable: true,
        };
      }

      const errorText = await response.text();
      return {
        success: false,
        error: `KSeF zwrócił ${response.status}: ${errorText.slice(0, 200)}`,
        errorCode: `HTTP_${response.status}`,
        retryable: response.status >= 500,
      };
    }

    const upoXml = await response.text();
    const upoXmlHash = await sha256(upoXml);
    const acceptanceTimestamp = extractAcceptanceTimestamp(upoXml);
    const upoId = extractUpoId(upoXml);

    return {
      success: true,
      upoXml,
      upoXmlHash,
      upoId,
      acceptanceTimestamp,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: `UPO — przekroczono limit czasu żądania (${timeoutMs} ms)`,
        errorCode: 'TIMEOUT',
        retryable: true,
      };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Błąd pobierania UPO: ${message}`,
      retryable: true,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function extractAcceptanceTimestamp(upoXml: string): string {
  const match = upoXml.match(
    /<(?:DataPrzyjeciaWKsef|AcceptanceTimestamp|DataAkceptacji)>([^<]+)</,
  );
  return match?.[1] ?? new Date().toISOString();
}

function extractUpoId(upoXml: string): string | undefined {
  const match = upoXml.match(/<(?:NumerUPO|UpoNumber|IdUPO)>([^<]+)</);
  return match?.[1];
}
