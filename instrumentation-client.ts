import * as Sentry from '@sentry/nextjs';
import { initPosthogBrowser } from '@/lib/analytics/init-posthog-browser';
import { sentryPrivacyOptions } from '@/lib/observability/scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  ...sentryPrivacyOptions,
  tracesSampleRate: 0.1,
  debug: false,
  ignoreErrors: [
    'NEXT_NOT_FOUND',
    'NEXT_REDIRECT',
    'NonRetriableError',
    'ChunkLoadError',
    'Loading chunk',
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
  ],
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
});

initPosthogBrowser();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
