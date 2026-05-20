import 'server-only';
import { PostHog } from 'posthog-node';

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

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key || key.startsWith('phc_xxx')) return null;
  if (client) return client;
  client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

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
  const c = getClient();
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
