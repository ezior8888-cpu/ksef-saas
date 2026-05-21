import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from './events';
import { getBrowserPosthog, isBrowserPosthogReady } from './browser-posthog';

/**
 * Client-side tracking (Faza 31 Krok 3).
 *
 * Cienka warstwa nad `posthog-js` (instancja z `array.js` / `window.posthog`).
 * `track()` przyjmuje wyłącznie nazwy z taksonomii (`AnalyticsEventName`).
 */

export { ANALYTICS_EVENTS };

/** Wysyła event do PostHog (jeśli załadowany i jest zgoda). */
export function track(
  event: AnalyticsEventName,
  properties?: AnalyticsProperties,
): void {
  if (!isBrowserPosthogReady()) return;
  getBrowserPosthog()?.capture(event, properties);
}

/** Ręczny pageview — App Router nie ma natywnego page-change eventu. */
export function trackPageView(url: string): void {
  if (!isBrowserPosthogReady()) return;
  getBrowserPosthog()?.capture('$pageview', { $current_url: url });
}

/**
 * Generyczny „feature_used" — do lekkiego trackowania użycia funkcji bez
 * dodawania osobnego eventu do taksonomii. `feature` ląduje jako property.
 */
export function trackFeatureUsed(feature: string): void {
  track(ANALYTICS_EVENTS.featureUsed, { feature });
}
