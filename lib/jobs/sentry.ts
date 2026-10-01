/**
 * Sentry w workerze pg-boss.
 *
 * Next uruchamia Sentry w `instrumentation.ts` (`sentry.server.config.ts`),
 * ale worker to osobny proces (`node … lib/jobs/worker.ts`) i tamtego pliku
 * nie ładuje. Bez klienta każde `Sentry.captureMessage/captureException`
 * w jobach jest cichym no-opem — watchdog zawieszonych eksportów, nieudane
 * usunięcie konta (RODO), kopie zapasowe, UPO. Produkcja jest na pg-boss od
 * 25.09.2026; do 01.10.2026 żaden z tych alertów nie mógł dojść.
 */

import * as Sentry from '@sentry/nextjs';

import { sentryPrivacyOptions } from '@/lib/observability/scrub';

type Env = Record<string, string | undefined>;

/**
 * Inicjalizuje Sentry raz na proces. Zwraca, czy alerty faktycznie wyjdą
 * (produkcja + `SENTRY_DSN`) — worker loguje to przy starcie, żeby brak
 * zmiennej był widoczny w logach kontenera, a nie dopiero przy awarii.
 */
export function initWorkerSentry(env: Env = process.env): boolean {
  const active = env.NODE_ENV === 'production' && Boolean(env.SENTRY_DSN);
  if (Sentry.getClient()) return active;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    ...sentryPrivacyOptions,
    tracesSampleRate: 0,
    debug: false,
    // Jak w `sentry.server.config.ts`: odmowa „bez ponawiania” to decyzja
    // joba, nie awaria.
    ignoreErrors: ['NonRetriableError'],
    environment: env.APP_ENV ?? env.NODE_ENV,
    enabled: env.NODE_ENV === 'production',
    initialScope: { tags: { runtime: 'pgboss-worker' } },
  });
  return active;
}

/** Job wyczerpał próby — jedyny ślad poza logiem kontenera. */
export function reportExhaustedJob(queue: string, error: Error, reason: string): void {
  Sentry.captureException(error, { tags: { queue, exhausted_reason: reason } });
}

/** Worker nie wstał — Coolify zrestartuje kontener, ale ktoś musi wiedzieć czemu. */
export function reportWorkerStartupFailure(error: unknown): void {
  Sentry.captureException(error, { tags: { phase: 'startup' } });
}

/** Przed wyjściem procesu: zdarzenia w kolejce wysyłki nie mogą przepaść. */
export async function flushWorkerSentry(timeoutMs = 2000): Promise<void> {
  await Sentry.flush(timeoutMs).catch(() => false);
}
