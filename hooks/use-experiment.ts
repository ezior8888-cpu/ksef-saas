'use client';

import { useEffect, useState } from 'react';

import { getBrowserPosthog, isBrowserPosthogReady } from '@/lib/analytics/browser-posthog';

/**
 * React hook do PostHog A/B experiments (Faza 31 Krok 6).
 *
 * Zwraca wariant eksperymentu dla bieżącego usera. Reaguje na późne
 * załadowanie flag (PostHog ładuje je async po `init`).
 *
 * Wartości zwracane:
 *   - `string` — nazwa wariantu (np. 'control', 'variant-a'),
 *   - `true` — flaga binarna włączona,
 *   - `false` — flaga binarna wyłączona,
 *   - `null` — PostHog niezaładowany albo user nieobjęty eksperymentem.
 *
 * Wywołanie `getFeatureFlag` powoduje, że PostHog wysyła automatycznie
 * event `$feature_flag_called` — analiza konwersji eksperymentu działa
 * od razu, bez dodatkowego trackingu po naszej stronie.
 *
 * Przykład:
 *   const variant = useExperiment('signup-cta-copy');
 *   const label = variant === 'variant-a' ? 'Zacznij za darmo' : 'Zarejestruj się';
 */
export function useExperiment(
  flagKey: string,
): string | boolean | null {
  const [variant, setVariant] = useState<string | boolean | null>(null);

  useEffect(() => {
    const ph = getBrowserPosthog();
    if (!ph || !isBrowserPosthogReady()) return;

    const read = () => {
      const v = ph.getFeatureFlag(flagKey);
      setVariant(v ?? null);
    };

    read();
    ph.onFeatureFlags(read);
  }, [flagKey]);

  return variant;
}
