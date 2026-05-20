import 'server-only';
import { PostHog } from 'posthog-node';
import type { AnalyticsEventName, AnalyticsProperties } from './events';

/**
 * Server-side tracking (Faza 31 Krok 4).
 *
 * Eventy o znaczeniu biznesowym (signup, payment, invoice) wysyłamy
 * z serwera, nie z klienta — są wtedy odporne na ad-blockery, wyłączony
 * JS i nie zależą od zgody na cookies (legitimate interest, pseudonimizacja
 * przez `distinctId = userId`).
 *
 * `flushAt: 1` + `await flush()` w `trackServer` — w środowisku serverless
 * (Vercel) proces jest ubijany zaraz po odpowiedzi; bez natychmiastowego
 * flusha event nigdy by nie wyszedł.
 */

let client: PostHog | null = null;

function isConfigured(): boolean {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return false;
  if (key.startsWith('phc_xxx') || key === 'phc_placeholder') return false;
  return true;
}

function getClient(): PostHog | null {
  if (!isConfigured()) return null;
  if (client) return client;
  client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    // Flush po każdym evencie — serverless nie daje czasu na batching.
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

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
  const c = getClient();
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
  const c = getClient();
  if (!c) return;
  try {
    c.identify({ distinctId, properties });
    await c.flush();
  } catch (err) {
    console.error('[analytics:server] identify failed:', err);
  }
}
