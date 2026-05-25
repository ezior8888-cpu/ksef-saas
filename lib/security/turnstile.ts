import 'server-only';

import { headers } from 'next/headers';

/**
 * Cloudflare Turnstile — bot protection alternatywa do reCAPTCHA / hCaptcha.
 *
 * Dlaczego Turnstile:
 *   - Free tier bez limitu requestów (dla siteKey kategorii "managed").
 *   - Brak tracking userów (Cloudflare nie sprzedaje danych jak Google).
 *   - EU-friendly (zgodność z RODO).
 *   - Invisible mode dla większości userów — challenge tylko gdy podejrzany ruch.
 *
 * Flow:
 *   1. Frontend renderuje widget z `siteKey` (NEXT_PUBLIC_TURNSTILE_SITE_KEY).
 *   2. Cloudflare zwraca token w hidden input `cf-turnstile-response`.
 *   3. Server Action wyciąga token z FormData i weryfikuje na CF API.
 *   4. CF odpowiada `{ success: true/false, error-codes: [...] }`.
 *
 * Tokens są one-time-use i wygasają po ~5 min.
 */

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const REQUEST_TIMEOUT_MS = 5000;

export interface TurnstileVerifyResult {
  success: boolean;
  /** True gdy env nieskonfigurowane (lokalny dev) — przepuszczamy. */
  skipped?: boolean;
  /** True gdy LOAD_TEST_MODE + nagłówek bypass (nigdy na produkcji). */
  bypass?: boolean;
  /** error-codes z CF API. */
  errors?: string[];
}

/** Nagłówek dla botów load-test (tylko gdy `LOAD_TEST_MODE=true`, nie prod). */
export const TURNSTILE_BYPASS_HEADER = 'x-turnstile-bypass';

/**
 * Środowisko produkcyjne — bypass Turnstile jest tu zawsze wyłączony.
 */
export function isProductionDeploy(): boolean {
  if (process.env.VERCEL_ENV === 'production') return true;
  if (process.env.NEXT_PUBLIC_APP_ENV === 'production') return true;
  return false;
}

function isLoadTestModeEnabled(): boolean {
  return process.env.LOAD_TEST_MODE === 'true';
}

/**
 * Bypass Turnstile dla testów obciążeniowych (Faza 28).
 * Wymaga: `LOAD_TEST_MODE=true` + nagłówek `x-turnstile-bypass` (niepusty).
 * NIGDY nie zwraca true na produkcji (`VERCEL_ENV` / `NEXT_PUBLIC_APP_ENV`).
 */
export async function isTurnstileBypassActive(): Promise<boolean> {
  if (isProductionDeploy()) return false;
  if (!isLoadTestModeEnabled()) return false;

  const h = await headers();
  const value = h.get(TURNSTILE_BYPASS_HEADER)?.trim();
  return Boolean(value);
}

export function isTurnstileConfigured(): boolean {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return false;
  if (secret.includes('xxx')) return false;
  return true;
}

/**
 * Weryfikuje token Turnstile po stronie serwera.
 *
 * - Brak ustawienia env vars → `{ success: true, skipped: true }`.
 *   Lokalny dev nie wymaga konta Cloudflare.
 * - Brak tokena gdy skonfigurowane → `{ success: false }` (twardy blok).
 * - Network error / timeout → `{ success: false, errors: ['network'] }`.
 *   Fail-closed, bo bot protection musi działać. Cloudflare ma 99.99%+
 *   uptime, więc to ekstremalnie rzadki edge case.
 */
export interface VerifyTurnstileOptions {
  /** Tylko logowanie (load test). Rejestracja / reset hasła — bez bypass. */
  allowLoadTestBypass?: boolean;
}

export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string,
  options?: VerifyTurnstileOptions,
): Promise<TurnstileVerifyResult> {
  if (
    options?.allowLoadTestBypass === true &&
    (await isTurnstileBypassActive())
  ) {
    return { success: true, skipped: true, bypass: true };
  }

  if (!isTurnstileConfigured()) {
    return { success: true, skipped: true };
  }

  if (!token || typeof token !== 'string' || token.length < 10) {
    return { success: false, errors: ['missing-token'] };
  }

  const body = new URLSearchParams();
  body.append('secret', process.env.TURNSTILE_SECRET_KEY!);
  body.append('response', token);
  if (ip && ip !== 'unknown') body.append('remoteip', ip);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { success: false, errors: ['verify-http-error'] };
    }

    const data = (await res.json()) as {
      success: boolean;
      'error-codes'?: string[];
    };

    return {
      success: data.success === true,
      errors: data['error-codes'],
    };
  } catch (err) {
    console.error('[turnstile] verify error:', err);
    return { success: false, errors: ['network'] };
  }
}
