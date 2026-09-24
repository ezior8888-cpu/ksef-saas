import * as Sentry from '@sentry/nextjs';
import { sentryPrivacyOptions } from '@/lib/observability/scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  ...sentryPrivacyOptions,
  tracesSampleRate: 0.1,
  debug: false,
  ignoreErrors: ['NEXT_NOT_FOUND', 'NEXT_REDIRECT', 'NonRetriableError'],
  environment: process.env.APP_ENV ?? process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
});
