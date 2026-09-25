import posthog from 'posthog-js';

import {
  ANALYTICS_CONSENT_EVENT,
  CONSENT_KEY,
  hasAnalyticsConsent,
  isAnalyticsConfigured,
} from './consent';
import { sanitizeAnalyticsEvent } from './privacy';

export const POSTHOG_INIT_DEFAULTS = '2026-01-30' as const;

function syncPosthogConsent(): void {
  if (!hasAnalyticsConsent()) {
    if (posthog.__loaded) {
      posthog.stopSessionRecording();
      posthog.opt_out_capturing();
    }
    return;
  }
  if (!isAnalyticsConfigured()) return;

  if (!posthog.__loaded) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: '/ingest',
      ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      defaults: POSTHOG_INIT_DEFAULTS,
      person_profiles: 'identified_only',
      persistence: 'memory',
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
      capture_pageview: 'history_change',
      capture_pageleave: true,
      // Invoices contain personal data in text, DOM attributes, images and URLs.
      // Masking text alone cannot make recordings or automatic clicks safe.
      autocapture: false,
      disable_session_recording: true,
      session_recording: { maskAllInputs: true, maskTextSelector: '*' },
      enable_recording_console_log: false,
      capture_exceptions: false,
      capture_performance: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      rageclick: false,
      disable_surveys: true,
      disable_product_tours: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      save_referrer: false,
      save_campaign_params: false,
      ip: false,
      before_send: sanitizeAnalyticsEvent,
    });
  }

  if (posthog.has_opted_out_capturing()) {
    posthog.opt_in_capturing({ captureEventName: false });
    // opt_in_capturing emits the SDK initial pageview; do not count it twice.
  }
}

function onStorage(event: StorageEvent): void {
  if (event.key === CONSENT_KEY || event.key === null) syncPosthogConsent();
}

/** No PostHog initialization, requests or identifiers before explicit consent. */
export function initPosthogBrowser(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener(ANALYTICS_CONSENT_EVENT, syncPosthogConsent);
  window.addEventListener('storage', onStorage);
  syncPosthogConsent();
}
