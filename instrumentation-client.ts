/**
 * Konfiguracja Sentry po stronie przeglądarki (ładowana dynamicznie z
 * komponentu klienckiego — nie importuj tego pliku w Server Components).
 */
import * as Sentry from '@sentry/nextjs';

/**
 * Maskuje bearer-token z URL-i portalu księgowej.
 *
 * Każdy URL postaci `/accountant/<token>/...` ma w segmencie `<token>` żywy
 * dostęp do faktur tenanta. Bez tej maski Sentry zaciągałby pełne URL-e
 * w breadcrumbs / `request.url` / `transaction` — i każda osoba z dostępem
 * do projektu Sentry mogłaby skopiować token i zalogować się jako księgowa.
 */
const ACCOUNTANT_TOKEN_PATTERN = /\/accountant\/[^/?#]+/g;
const ACCOUNTANT_REDACTED = '/accountant/[REDACTED]';

function redactAccountantTokenInUrl(url: unknown): unknown {
  if (typeof url !== 'string') return url;
  return url.replace(ACCOUNTANT_TOKEN_PATTERN, ACCOUNTANT_REDACTED);
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

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
    'ChunkLoadError',
    'Loading chunk',
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
  ],

  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

  enabled: process.env.NODE_ENV === 'production',

  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data && typeof breadcrumb.data === 'object') {
      const data = breadcrumb.data as Record<string, unknown>;
      if (typeof data.url === 'string') {
        data.url = redactAccountantTokenInUrl(data.url);
      }
      if (typeof data.to === 'string') {
        data.to = redactAccountantTokenInUrl(data.to);
      }
      if (typeof data.from === 'string') {
        data.from = redactAccountantTokenInUrl(data.from);
      }
    }
    if (typeof breadcrumb.message === 'string') {
      breadcrumb.message = breadcrumb.message.replace(
        ACCOUNTANT_TOKEN_PATTERN,
        ACCOUNTANT_REDACTED,
      );
    }
    return breadcrumb;
  },

  beforeSend(event) {
    if (event.request?.url) {
      event.request.url = String(redactAccountantTokenInUrl(event.request.url));
    }
    if (event.transaction) {
      event.transaction = event.transaction.replace(
        ACCOUNTANT_TOKEN_PATTERN,
        ACCOUNTANT_REDACTED,
      );
    }
    return event;
  },
});
