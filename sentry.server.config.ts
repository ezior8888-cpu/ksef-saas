// Inicjalizacja Sentry po stronie Node (SSR, route handlers, Server Actions).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
  ],

  enableLogs: true,

  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

  debug: false,

  ignoreErrors: [
    'NEXT_NOT_FOUND',
    'NEXT_REDIRECT',
    'NonRetriableError',
  ],

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  enabled: process.env.NODE_ENV === 'production',
});
