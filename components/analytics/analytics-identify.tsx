'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

import { isBrowserPosthogReady } from '@/lib/analytics/browser-posthog';

export function AnalyticsIdentify({
  userId,
  email,
  tenantId,
}: {
  userId: string;
  email: string | null;
  tenantId: string;
}) {
  useEffect(() => {
    if (!isBrowserPosthogReady()) return;
    if (posthog.has_opted_out_capturing()) return;

    posthog.identify(userId, {
      email: email ?? undefined,
    });

    posthog.group('tenant', tenantId);
  }, [userId, email, tenantId]);

  return null;
}
