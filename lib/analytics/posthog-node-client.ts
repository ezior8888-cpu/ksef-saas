import 'server-only';

import { PostHog } from 'posthog-node';

/**
 * Jeden singleton `posthog-node` dla całego serwera (jak w dokumentacji PostHog).
 *
 * Token: `NEXT_PUBLIC_POSTHOG_KEY` (Project API Key — ten sam co w przeglądarce).
 * Host: `NEXT_PUBLIC_POSTHOG_HOST` lub domyślnie `https://eu.i.posthog.com`.
 *
 * @see https://posthog.com/docs/libraries/node
 */

let instance: PostHog | null = null;

export function isPostHogNodeConfigured(): boolean {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return false;
  if (key.startsWith('phc_xxx') || key === 'phc_placeholder') return false;
  return true;
}

/**
 * Klient Node do capture / feature flags. `null` gdy brak poprawnej konfiguracji.
 */
export function getPostHogNodeClient(): PostHog | null {
  if (!isPostHogNodeConfigured()) return null;
  if (!instance) {
    instance = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
        'https://eu.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return instance;
}

/**
 * Jak `getPostHogNodeClient()`, ale rzuca gdy PostHog nie jest skonfigurowany.
 */
export function requirePostHogNodeClient(): PostHog {
  const c = getPostHogNodeClient();
  if (!c) {
    throw new Error(
      'PostHog is not configured (set NEXT_PUBLIC_POSTHOG_KEY in env — see docs/analytics/posthog-szablon-konfiguracji.md)',
    );
  }
  return c;
}

/**
 * Opróżnia kolejkę i zamyka klienta — wywołaj przy końcu procesu (np. SIGTERM).
 * W route handlerach zwykle wystarcza `await flush()` po operacji (robi `trackServer`).
 */
export async function shutdownPostHogNodeClient(): Promise<void> {
  if (!instance) return;
  try {
    await instance.shutdown();
  } catch (err) {
    console.error('[analytics:posthog-node] shutdown failed:', err);
  } finally {
    instance = null;
  }
}
