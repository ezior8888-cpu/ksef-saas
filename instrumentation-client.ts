/**
 * Konfiguracja Sentry po stronie przeglądarki (ładowana dynamicznie z
 * komponentu klienckiego — nie importuj tego pliku w Server Components).
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

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

  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

  enabled: process.env.NODE_ENV === 'production',
});
