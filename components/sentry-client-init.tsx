'use client';

import { useEffect } from 'react';

/**
 * Inicjalizacja Sentry w przeglądarce (instrumentation-client.ts nie może
 * być importowany z root layout — ten komponent jest tylko po stronie klienta).
 */
export function SentryClientInit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    void import('@/instrumentation-client');
  }, []);

  return null;
}
