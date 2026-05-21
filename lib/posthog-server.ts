/**
 * Kompatybilność wsteczna — preferuj import z `@/lib/analytics/posthog-node-client`.
 */
import 'server-only';

export {
  getPostHogNodeClient as getPostHogClient,
  isPostHogNodeConfigured,
  requirePostHogNodeClient,
  shutdownPostHogNodeClient,
} from '@/lib/analytics/posthog-node-client';
