import posthog from 'posthog-js';
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from './events';

/**
 * Client-side tracking (Faza 31 Krok 3).
 *
 * Cienka warstwa nad `posthog-js`. `track()` przyjmuje wyłącznie nazwy
 * z taksonomii (`AnalyticsEventName`) — literówka nie przejdzie typechecka.
 *
 * Wszystkie funkcje są no-op gdy PostHog niezaładowany (brak env / brak
 * zgody) — komponenty mogą wołać `track()` bez sprawdzania stanu.
 */

export { ANALYTICS_EVENTS };

function isReady(): boolean {
  return typeof window !== 'undefined' && posthog.__loaded === true;
}

/** Wysyła event do PostHog (jeśli załadowany i jest zgoda). */
export function track(
  event: AnalyticsEventName,
  properties?: AnalyticsProperties,
): void {
  if (!isReady()) return;
  posthog.capture(event, properties);
}

/** Ręczny pageview — App Router nie ma natywnego page-change eventu. */
export function trackPageView(url: string): void {
  if (!isReady()) return;
  posthog.capture('$pageview', { $current_url: url });
}

/**
 * Generyczny „feature_used" — do lekkiego trackowania użycia funkcji bez
 * dodawania osobnego eventu do taksonomii. `feature` ląduje jako property.
 */
export function trackFeatureUsed(feature: string): void {
  track(ANALYTICS_EVENTS.featureUsed, { feature });
}
