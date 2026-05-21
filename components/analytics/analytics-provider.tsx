'use client';

import type { PostHog } from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect, useState } from 'react';

import {
  getBrowserPosthog,
  isBrowserPosthogReady,
  POSTHOG_BROWSER_READY_EVENT,
} from '@/lib/analytics/browser-posthog';
import { isAnalyticsConfigured } from '@/lib/analytics/consent';
import { ConsentBanner } from './consent-banner';
import { PageViewTracker } from './page-view-tracker';
import { PosthogSnippetLoader } from './posthog-snippet-loader';

/**
 * PostHog (Faza 31): loader `array.js` + init jak w snippetcie panelu,
 * potem `PostHogProvider` po gotowości (`ff:posthog-ready`).
 */
export function AnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [client, setClient] = useState<PostHog | undefined>(undefined);

  useEffect(() => {
    if (!isAnalyticsConfigured()) return;

    const sync = () => {
      const ph = getBrowserPosthog();
      if (ph && isBrowserPosthogReady()) setClient(ph);
    };

    sync();
    window.addEventListener(POSTHOG_BROWSER_READY_EVENT, sync);
    return () => window.removeEventListener(POSTHOG_BROWSER_READY_EVENT, sync);
  }, []);

  if (!isAnalyticsConfigured()) {
    return <>{children}</>;
  }

  return (
    <>
      <PosthogSnippetLoader />
      {client ? (
        <PostHogProvider client={client}>
          <PageViewTracker />
          {children}
          <ConsentBanner />
        </PostHogProvider>
      ) : (
        <>{children}</>
      )}
    </>
  );
}
