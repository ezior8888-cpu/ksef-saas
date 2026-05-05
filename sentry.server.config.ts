// Inicjalizacja Sentry po stronie Node (SSR, route handlers, Server Actions).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

/**
 * Lista nagłówków, których NIGDY nie wysyłamy do Sentry.
 *
 * Authorization / Cookie zawierają access tokeny Supabase (JWT) — wyciek do
 * cudzego storage'u to gotowy session-hijacking.
 * X-API-Key bywa używane przez integracje SaaS (Resend, Inngest webhook signing,
 * GUS). Też nie chcemy, by lądowało w event payloadzie Sentry.
 */
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key'] as const;

function stripSensitiveHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return headers;
  for (const key of Object.keys(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase() as (typeof SENSITIVE_HEADERS)[number])) {
      delete headers[key];
    }
  }
  return headers;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
  ],

  enableLogs: true,

  // Płaski 0.1 — Vercel naliczy mniej budgetu Sentry, a my i tak otrzymamy
  // statystycznie reprezentatywną próbkę traces. Dev/local nie wysyła nic
  // (`enabled: production` poniżej), więc lokalnie sample-rate i tak nie ma
  // znaczenia.
  tracesSampleRate: 0.1,

  debug: false,

  ignoreErrors: [
    'NEXT_NOT_FOUND',
    'NEXT_REDIRECT',
    'NonRetriableError',
  ],

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  enabled: process.env.NODE_ENV === 'production',

  /**
   * PII-strip przed wysłaniem zdarzenia.
   *
   * Sentry domyślnie zbiera `event.request.headers` i `cookies` przy SSR-owych
   * błędach. Nawet z `sendDefaultPii: false` (default) Authorization potrafi
   * trafić do payloadu — beforeSend to ostatnia linia obrony przed wyciekiem
   * tokenów do cudzego storage'u.
   */
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      event.request.headers = stripSensitiveHeaders(event.request.headers);
    }
    return event;
  },
});
