/** Browser analytics starts only after an explicit opt-in. */
export const CONSENT_KEY = 'ff_analytics_consent';
export const ANALYTICS_CONSENT_EVENT = 'ff:analytics-consent';

export type ConsentState = 'granted' | 'denied' | 'unset';
// A choice still applies to this page when storage is unavailable.
let transientConsent: ConsentState | undefined;

export function isAnalyticsConfigured(): boolean {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return false;
  if (key.startsWith('phc_xxx') || key === 'phc_placeholder') return false;
  return true;
}

export function getAnalyticsConsent(): ConsentState {
  if (typeof window === 'undefined') return 'unset';
  if (transientConsent !== undefined) return transientConsent;
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : 'unset';
  } catch {
    return transientConsent ?? 'unset';
  }
}

export function setAnalyticsConsent(granted: boolean): void {
  if (typeof window === 'undefined') return;
  transientConsent = granted ? 'granted' : 'denied';
  try {
    window.localStorage.setItem(CONSENT_KEY, transientConsent);
    transientConsent = undefined;
  } catch {
    // The current choice stays in memory until this page is closed.
  }
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsent() === 'granted';
}
