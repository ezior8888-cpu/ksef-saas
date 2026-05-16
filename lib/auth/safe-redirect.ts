/**
 * Whitelist relative-path redirect — wycina open-redirect próby.
 * Reguły zgodne z `app/auth/callback/route.ts`.
 *
 * Akceptujemy:
 *   - puste / null / brakujące → fallback `/dashboard`
 *   - ścieżki zaczynające się od `/` (bez `//` ani `/\\`)
 *   - bez `://` (schemat absolutny)
 *
 * Wszystko inne → `/dashboard`.
 */
const FALLBACK = '/dashboard';

export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return FALLBACK;
  if (!raw.startsWith('/')) return FALLBACK;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return FALLBACK;
  if (raw.includes('://')) return FALLBACK;
  return raw;
}
