'use client';

import { useEffect, useState } from 'react';
import posthog from 'posthog-js';

import { isBrowserPosthogReady } from '@/lib/analytics/browser-posthog';

export function useExperiment(
  flagKey: string,
): string | boolean | null {
  const [variant, setVariant] = useState<string | boolean | null>(null);

  useEffect(() => {
    if (!isBrowserPosthogReady()) return;

    const read = () => {
      const v = posthog.getFeatureFlag(flagKey);
      setVariant(v ?? null);
    };

    read();
    posthog.onFeatureFlags(read);
  }, [flagKey]);

  return variant;
}
