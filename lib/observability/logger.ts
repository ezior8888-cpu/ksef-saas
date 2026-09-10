import { isSensitiveDebugAllowed } from '@/lib/security/debug';

/** Debug/info wyłącznie w jawnym lokalnym runtime; warn/error zostają w logach
 * kontenera. Automatyczny eksport console do Sentry jest wyłączony — błędy
 * aplikacji raportujemy przez captureException z filtrem prywatności.
 */

function devOnly(method: 'log' | 'info') {
  return (...args: unknown[]): void => {
    if (!isSensitiveDebugAllowed()) return;
    console[method](...args);
  };
}

export const logger = {
  /** Szczegóły deweloperskie. No-op na produkcji. */
  debug: devOnly('log'),
  /** Informacje przebiegu. No-op na produkcji. */
  info: devOnly('info'),
  /** Ostrzeżenia — zawsze. */
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  /** Błędy — zawsze. */
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
} as const;
