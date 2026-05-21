import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // PostHog Node: flush kolejki przy zamykaniu procesu (dokumentacja SDK).
    const { shutdownPostHogNodeClient } = await import(
      '@/lib/analytics/posthog-node-client'
    );
    const onShutdown = () => {
      void shutdownPostHogNodeClient();
    };
    process.on('SIGTERM', onShutdown);
    process.on('SIGINT', onShutdown);
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
