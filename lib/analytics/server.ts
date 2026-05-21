import 'server-only';

import type { AnalyticsEventName, AnalyticsProperties } from './events';
import { getPostHogNodeClient } from './posthog-node-client';

/**
 * Server-side tracking (Faza 31 Krok 4).
 *
 * Eventy o znaczeniu biznesowym (signup, payment, invoice) wysyłamy
 * z serwera, nie z klienta — są wtedy odporne na ad-blockery, wyłączony
 * JS i nie zależą od zgody na cookies (legitimate interest, pseudonimizacja
 * przez `distinctId = userId`).
 *
 * Klient Node: singleton w `posthog-node-client.ts` (token + host z env).
 *
 * `flushAt: 1` + `await flush()` w `trackServer` — w środowisku serverless
 * (Vercel) proces jest ubijany zaraz po odpowiedzi; bez natychmiastowego
 * flusha event nigdy by nie wyszedł.
 */

export interface TrackServerInput {
  /** Zwykle `userId`. Dla zdarzeń bez usera — stabilny identyfikator (np. tenantId). */
  distinctId: string;
  event: AnalyticsEventName;
  properties?: AnalyticsProperties;
  /** Properties osoby do zaktualizowania razem z eventem (np. plan, tenant). */
  setPersonProperties?: AnalyticsProperties;
}

/**
 * Wysyła event z serwera. Nigdy nie rzuca — analityka nie może wywrócić
 * operacji biznesowej (Server Action / Inngest job).
 */
export async function trackServer(input: TrackServerInput): Promise<void> {
  const c = getPostHogNodeClient();
  if (!c) return;
  try {
    c.capture({
      distinctId: input.distinctId,
      event: input.event,
      properties: input.properties,
      ...(input.setPersonProperties
        ? { $set: input.setPersonProperties }
        : {}),
    });
    await c.flush();
  } catch (err) {
    console.error('[analytics:server] capture failed:', err);
  }
}

/**
 * Powiązanie `distinctId` z properties osoby (bez wysyłania eventu).
 * Używane w Kroku 5 (identify) — np. po signupie.
 */
export async function identifyServer(
  distinctId: string,
  properties: AnalyticsProperties,
): Promise<void> {
  const c = getPostHogNodeClient();
  if (!c) return;
  try {
    c.identify({ distinctId, properties });
    await c.flush();
  } catch (err) {
    console.error('[analytics:server] identify failed:', err);
  }
}
