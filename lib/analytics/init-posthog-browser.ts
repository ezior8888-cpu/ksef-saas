import posthog from 'posthog-js';

import { getAnalyticsConsent, isAnalyticsConfigured } from './consent';

export const POSTHOG_INIT_DEFAULTS = '2026-01-30' as const;

/**
 * Inicjalizacja PostHog w przeglądarce — wywołaj z `instrumentation-client.ts`
 * (oficjalna ścieżka Next.js). `defaults: '2026-01-30'` włącza m.in.
 * `capture_pageview: 'history_change'` i `$pageleave` (checklist w panelu).
 *
 * Nie ustawiaj `capture_pageview: false` — nadpisuje defaults i wizard zostaje 0/3.
 */
export function initPosthogBrowser(): void {
  if (typeof window === 'undefined') return;
  if (!isAnalyticsConfigured() || posthog.__loaded) return;

  const consent = getAnalyticsConsent();
  const denied = consent === 'denied';
  const granted = consent === 'granted';

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: '/ingest',
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: POSTHOG_INIT_DEFAULTS,
    person_profiles: 'identified_only',
    capture_pageleave: true,
    autocapture: true,
    opt_out_capturing_by_default: denied,
    disable_session_recording: !granted,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
    },
  });

  if (!denied) {
    posthog.opt_in_capturing();
  }
}
