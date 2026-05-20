'use client';

import { useEffect, useState } from 'react';
import posthog from 'posthog-js';

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
    if (!posthog.__loaded) return;

    const read = () => {
      const v = posthog.getFeatureFlag(flagKey);
      setVariant(v ?? null);
    };

    read();
    // PostHog ładuje flagi async — subskrybujemy aktualizacje.
    posthog.onFeatureFlags(read);
  }, [flagKey]);

  return variant;
}
