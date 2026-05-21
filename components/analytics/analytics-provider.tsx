'use client';

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

import { isAnalyticsConfigured } from '@/lib/analytics/consent';
import { ConsentBanner } from './consent-banner';

/**
 * PostHog (Faza 31): init w `instrumentation-client.ts` (`initPosthogBrowser`).
 * Provider tylko owija drzewo — bez czekania na `array.js` / osobny stan klienta.
 */
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
      {children}
      <ConsentBanner />
    </PostHogProvider>
  );
}
