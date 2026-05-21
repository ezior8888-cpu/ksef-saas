import 'server-only';

import { getPostHogNodeClient } from './posthog-node-client';

/**
 * A/B testing przez PostHog feature flags (Faza 31 Krok 6).
 *
 * Dwa systemy flag w projekcie — różne cele:
 *
 *   1. `lib/feature-flags/` (Edge Config + per-tenant DB, Faza 22)
 *      — operacyjne kill-switche, rollouty per-tenant, decyzje
 *      kontrolowane przez nas (admin). Bez analityki.
 *
 *   2. PostHog feature flags (ten plik)
 *      — eksperymenty A/B. PostHog automatycznie łączy wariant z
 *      konwersją (signup/payment/etc.), więc w jednym miejscu
 *      widzimy „wariant B daje 12% wyższą konwersję".
 *
 * Reguła kciuka: jeśli to eksperyment do mierzenia → PostHog.
 * Jeśli to kontrola operacyjna („wyłącz Magic Import bo KSeF padło")
 * → Edge Config.
 */

/**
 * Pobiera wariant eksperymentu dla danego użytkownika/tenanta.
 *
 * Zwraca:
 * - `string` — nazwa wariantu (np. 'control', 'variant-a'),
 * - `true`/`false` — gdy flaga jest binarna (typowy A/B),
 * - `null` — gdy PostHog niedostępny lub user nieobjęty eksperymentem.
 *
 * PostHog automatycznie wysyła `$feature_flag_called` przy każdym wywołaniu —
 * pojawia się w lejku eksperymentu bez naszej akcji.
 */
export async function getExperimentVariant(
  distinctId: string,
  flagKey: string,
): Promise<string | boolean | null> {
  const c = getPostHogNodeClient();
  if (!c) return null;
  try {
    const v = await c.getFeatureFlag(flagKey, distinctId);
    return v ?? null;
  } catch (err) {
    console.error('[experiments] getFeatureFlag failed:', err);
    return null;
  }
}

/**
 * Wersja boolean dla prostych on/off flag.
 */
export async function isExperimentEnabled(
  distinctId: string,
  flagKey: string,
): Promise<boolean> {
  const v = await getExperimentVariant(distinctId, flagKey);
  return v === true || (typeof v === 'string' && v !== 'control');
}
