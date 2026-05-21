import posthog from 'posthog-js';

import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from './events';
import { isBrowserPosthogReady } from './browser-posthog';

/**
 * Client-side tracking (Faza 31 Krok 3).
 *
 * `$pageview` / `$pageleave` — automatycznie przez `defaults: '2026-01-30'`
 * w `initPosthogBrowser()` (history_change + pageleave).
 */

export { ANALYTICS_EVENTS };

function canCapture(): boolean {
  return isBrowserPosthogReady() && !posthog.has_opted_out_capturing();
}

/** Wysyła event do PostHog (jeśli załadowany i nie ma opt-out). */
export function track(
  event: AnalyticsEventName,
  properties?: AnalyticsProperties,
): void {
  if (!canCapture()) return;
  posthog.capture(event, properties);
}

/** Ręczny pageview — zwykle zbędny przy `defaults`; zostawione na wypadek SPA edge case. */
export function trackPageView(url: string): void {
  if (!canCapture()) return;
  posthog.capture('$pageview', { $current_url: url });
}

export function trackFeatureUsed(feature: string): void {
  track(ANALYTICS_EVENTS.featureUsed, { feature });
}
