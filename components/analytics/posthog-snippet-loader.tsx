'use client';

import Script from 'next/script';

import {
  initBrowserPosthogAfterSnippet,
  POSTHOG_BROWSER_READY_EVENT,
} from '@/lib/analytics/browser-posthog';
import { isAnalyticsConfigured } from '@/lib/analytics/consent';

/**
 * Oficjalna ścieżka instalacji PostHoga: dynamiczne załadowanie `array.js`
 * z `eu-assets.i.posthog.com` (identycznie jak snippet „Option 1” w panelu),
 * potem `posthog.init` z proxy `/ingest` dla capture / flag / replay.
 *
 * Uwaga CSP: przy **wymuszonym** `Content-Security-Policy` dodaj host do
 * `script-src` (obecnie nagłówek jest Report-Only).
 */
export function PosthogSnippetLoader() {
  if (!isAnalyticsConfigured()) return null;

  return (
    <Script
      id="posthog-js-snippet"
      strategy="afterInteractive"
      src="https://eu-assets.i.posthog.com/static/array.js"
      crossOrigin="anonymous"
      onLoad={() => {
        initBrowserPosthogAfterSnippet();
        window.dispatchEvent(new Event(POSTHOG_BROWSER_READY_EVENT));
      }}
    />
  );
}
