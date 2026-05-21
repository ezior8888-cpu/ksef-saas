import type { PostHog } from 'posthog-js';

import { getAnalyticsConsent, isAnalyticsConfigured } from './consent';

/**
 * Wersja domyślnych zachowań SDK — szablon PostHog Cloud / wizard instalacji.
 * @see https://posthog.com/docs/libraries/next-js
 */
export const POSTHOG_INIT_DEFAULTS = '2026-01-30' as const;

/** Zdarzenie po `posthog.init` (ładowanie snippet + init w jednym cyklu). */
export const POSTHOG_BROWSER_READY_EVENT = 'ff:posthog-ready' as const;

export function getBrowserPosthog(): PostHog | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { posthog?: PostHog }).posthog;
}

export function isBrowserPosthogReady(): boolean {
  const ph = getBrowserPosthog();
  return Boolean(ph && (ph as PostHog & { __loaded?: boolean }).__loaded);
}

/**
 * Wywołaj po załadowaniu `array.js` (jak oficjalny snippet HTML).
 * Ruch API idzie przez reverse proxy `/ingest`; sam loader może być z tej samej ścieżki.
 */
export function initBrowserPosthogAfterSnippet(): void {
  const ph = getBrowserPosthog();
  if (!ph || !isAnalyticsConfigured()) return;
  if ((ph as PostHog & { __loaded?: boolean }).__loaded) return;

  const consent = getAnalyticsConsent();
  const consentGranted = consent === 'granted';
  const isDev = process.env.NODE_ENV === 'development';
  // Prod: brak zgody = opt-out (RODO). Dev: tylko jawne „denied” blokuje — żeby
  // Live events / wizard działały od razu po `pnpm dev` bez klikania banera.
  const optOutByDefault = isDev ? consent === 'denied' : !consentGranted;

  ph.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: '/ingest',
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: POSTHOG_INIT_DEFAULTS,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    opt_out_capturing_by_default: optOutByDefault,
    disable_session_recording: !consentGranted,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
    },
  });
}
