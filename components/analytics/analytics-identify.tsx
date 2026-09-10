'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

import { isBrowserPosthogReady } from '@/lib/analytics/browser-posthog';
import { ANALYTICS_CONSENT_EVENT, hasAnalyticsConsent } from '@/lib/analytics/consent';

export function AnalyticsIdentify({ userId, tenantId }: {
  userId: string;
  tenantId: string;
}) {
  useEffect(() => {
    const identify = () => {
      if (!hasAnalyticsConsent() || !isBrowserPosthogReady()) return;
      if (posthog.has_opted_out_capturing()) return;
      // Analytics needs pseudonymous IDs, never an email address.
      posthog.identify(userId);
      posthog.group('tenant', tenantId);
    };
    identify();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, identify);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, identify);
  }, [userId, tenantId]);

  return null;
}
