import { isProductionDeploy } from '@/lib/security/environment';

/**
 * QA-1 (audyt przedlaunchowy): lekki structured logger.
 *
 * Problem: ~49 `console.log` w kodzie. Część w gałęziach dev-only (np. email
 * stub gdy Resend nieskonfigurowany) zawiera PII (email odbiorcy, dane faktury).
 * W prod te gałęzie zwykle się nie wykonują, ale to defense-in-depth: nawet
 * pomyłkowe wejście w nie nie może wylać PII do logów produkcyjnych.
 *
 * Zasady:
 *   - `debug` / `info` — TYLKO poza produkcją. W prod to no-op (cisza + brak PII).
 *   - `warn` / `error` — ZAWSZE. Sentry (consoleLoggingIntegration) łapie je
 *     po stronie klienta i serwera, więc trafiają do monitoringu.
 *
 * To nie zastępuje Sentry — to cienka warstwa, która porządkuje i wycisza
 * szum dev-debug na produkcji.
 */

function devOnly(method: 'log' | 'info') {
  return (...args: unknown[]): void => {
    if (isProductionDeploy()) return;
    console[method](...args);
  };
}

export const logger = {
  /** Szczegóły deweloperskie. No-op na produkcji. */
  debug: devOnly('log'),
  /** Informacje przebiegu. No-op na produkcji. */
  info: devOnly('info'),
  /** Ostrzeżenia — zawsze (Sentry consoleLoggingIntegration łapie). */
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  /** Błędy — zawsze (Sentry consoleLoggingIntegration łapie). */
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
} as const;
