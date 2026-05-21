/**
 * Zgoda na analytics (RODO) — Faza 31.
 *
 * Cookie banner z pełną granularnością powstaje dopiero w Fazie 38 (Legal).
 * Do tego czasu działa minimalny opt-in na **produkcji**: client-side tracking
 * startuje dopiero po świadomej zgodzie (`granted`). Na **localhost** capture
 * jest domyślnie włączony, dopóki user nie wybierze „Tylko niezbędne” (patrz
 * `browser-posthog.ts`). Server-side eventy
 * (signup, płatności — pseudonimizowane) lecą niezależnie od tej zgody,
 * bo opierają się na legitimate interest, nie na cookies przeglądarki.
 *
 * Stan trzymamy w localStorage — bez cookie, bez wpływu na SSR.
 *
 * **Development:** dopóki user nie wybierze „Tylko niezbędne”, capture w PostHogu
 * jest włączony (łatwiejszy podgląd w Live events). **Production:** dopóki brak
 * jawnej zgody (`granted`), klient startuje w opt-out (`browser-posthog.ts`).
 */

const CONSENT_KEY = 'ff_analytics_consent';

export type ConsentState = 'granted' | 'denied' | 'unset';

export function isAnalyticsConfigured(): boolean {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return false;
  // Placeholder z .env.example.
  if (key.startsWith('phc_xxx') || key === 'phc_placeholder') return false;
  return true;
}

export function getAnalyticsConsent(): ConsentState {
  if (typeof window === 'undefined') return 'unset';
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    if (v === 'granted' || v === 'denied') return v;
  } catch {
    // localStorage zablokowany (tryb prywatny) — traktuj jak brak zgody.
  }
  return 'unset';
}

export function setAnalyticsConsent(granted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
  } catch {
    // ignore — bez localStorage zgoda nie przetrwa reloadu, ale nie wybuchamy
  }
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsent() === 'granted';
}
