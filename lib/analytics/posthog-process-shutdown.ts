import 'server-only';

import {
  getPostHogNodeClient,
  shutdownPostHogNodeClient,
} from './posthog-node-client';

let listenersRegistered = false;

/**
 * Rejestruje `client.shutdown()` przy SIGINT / SIGTERM (dokumentacja posthog-node).
 *
 * Wywoływane z `instrumentation.ts` (runtime Node.js), **nie** z `proxy.ts` —
 * proxy Next.js działa na Edge i nie może ładować `posthog-node`.
 */
export function registerPostHogProcessShutdown(): void {
  if (listenersRegistered) return;
  if (typeof process === 'undefined' || !process.on) return;

  listenersRegistered = true;

  const closePostHog = async (signal: string) => {
    const client = getPostHogNodeClient();
    if (!client) return;

    console.log(
      `Zamykanie serwera (${signal}): Opróżnianie bufora PostHog...`,
    );
    try {
      await shutdownPostHogNodeClient();
      console.log('PostHog został pomyślnie zamknięty.');
    } catch (error) {
      console.error('Błąd podczas zamykania PostHog:', error);
    }
  };

  process.on('SIGINT', () => {
    void closePostHog('SIGINT').finally(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    void closePostHog('SIGTERM');
  });
}
