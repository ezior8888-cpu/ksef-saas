import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

function isConfigured(): boolean {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return false;
  if (key.startsWith('phc_xxx') || key === 'phc_placeholder') return false;
  return true;
}

/**
 * Singleton `posthog-node` — ten sam klucz co w `lib/analytics/server.ts`
 * (`NEXT_PUBLIC_POSTHOG_KEY`). Używaj tylko gdy potrzebujesz niskopoziomowego
 * API poza `trackServer` / `identifyServer`.
 */
export function getPostHogClient(): PostHog {
  if (!isConfigured()) {
    throw new Error(
      'PostHog is not configured (set NEXT_PUBLIC_POSTHOG_KEY in env)',
    );
  }
  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
        'https://eu.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}
