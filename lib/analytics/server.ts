import 'server-only';

import type { AnalyticsEventName, AnalyticsProperties } from './events';
import { getPostHogNodeClient } from './posthog-node-client';
import { isAllowedAnalyticsEvent, isSafeAnalyticsId, sanitizeAnalyticsProperties } from './privacy';

/**
 * Server-side business events use pseudonymous UUIDs and reviewed metrics.
 * They share the browser's data allowlist, without accessing browser consent
 * storage (background jobs do not have that context).
 */
export interface TrackServerInput {
  /** User or tenant UUID; never an email address or a document identifier. */
  distinctId: string;
  event: AnalyticsEventName;
  properties?: AnalyticsProperties;
  /** Reviewed person attributes, such as the subscription plan. */
  setPersonProperties?: AnalyticsProperties;
}

/** Analytics failure must not fail the business operation. */
export async function trackServer(input: TrackServerInput): Promise<void> {
  if (!isSafeAnalyticsId(input.distinctId) || !isAllowedAnalyticsEvent(input.event)) return;
  const c = getPostHogNodeClient();
  if (!c) return;
  try {
    c.capture({
      distinctId: input.distinctId,
      event: input.event,
      properties: sanitizeAnalyticsProperties(input.properties ?? {}),
      ...(input.setPersonProperties
        ? { $set: sanitizeAnalyticsProperties(input.setPersonProperties) }
        : {}),
    });
    await c.flush();
  } catch (err) {
    console.error('[analytics:server] capture failed:', err);
  }
}

/** Associates only reviewed attributes with a pseudonymous user/tenant ID. */
export async function identifyServer(
  distinctId: string,
  properties: AnalyticsProperties,
): Promise<void> {
  if (!isSafeAnalyticsId(distinctId)) return;
  const c = getPostHogNodeClient();
  if (!c) return;
  try {
    c.identify({ distinctId, properties: sanitizeAnalyticsProperties(properties) });
    await c.flush();
  } catch (err) {
    console.error('[analytics:server] identify failed:', err);
  }
}
