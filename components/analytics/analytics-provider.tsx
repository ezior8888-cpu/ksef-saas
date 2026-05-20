'use client';

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

import {
  getAnalyticsConsent,
  isAnalyticsConfigured,
} from '@/lib/analytics/consent';
import { ConsentBanner } from './consent-banner';
import { PageViewTracker } from './page-view-tracker';

/**
 * PostHog provider (Faza 31 Krok 1 + 3).
 *
 * Init jest EAGER (w zasięgu modułu, nie w `useEffect`) — wykonuje się przy
 * pierwszym imporcie po stronie klienta, zanim odpali jakikolwiek React
 * effect. Dzięki temu `PageViewTracker` widzi załadowany PostHog już przy
 * pierwszym pageview (efekty dzieci odpalają się przed efektem rodzica).
 *
 * Decyzje konfiguracyjne:
 * - `api_host: '/ingest'` — ruch przez nasz rewrite, omija ad-blockery.
 * - `person_profiles: 'identified_only'` — anonimowi nie zużywają limitu MAU.
 * - `capture_pageview: false` — pageviews ręcznie (`PageViewTracker`).
 * - Consent-gated: bez zgody PostHog jest załadowany, ale NIC nie wysyła
 *   (`opt_out_capturing_by_default`). Baner zgody (Krok 8) → `opt_in_capturing()`.
 * - Session replay z maskowaniem (`maskAllInputs` + `[data-ph-mask]` dla
 *   pól wrażliwych: NIP, kwoty, dane kontrahentów).
 */
if (
  typeof window !== 'undefined' &&
  isAnalyticsConfigured() &&
  !posthog.__loaded
) {
  const consentGranted = getAnalyticsConsent() === 'granted';
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: '/ingest',
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    opt_out_capturing_by_default: !consentGranted,
    disable_session_recording: !consentGranted,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
    },
  });
}

export function AnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAnalyticsConfigured()) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider client={posthog}>
      <PageViewTracker />
      {children}
      <ConsentBanner />
    </PostHogProvider>
  );
}
