/**
 * Konfiguracja backendu jobów (Etap 7: Inngest → pg-boss).
 *
 * `JOBS_BACKEND`:
 *   - 'inngest' (DEFAULT, także gdy brak/literówka — fail-safe na obecny,
 *     działający backend) — enqueue idzie do Inngest Cloud, /api/inngest
 *     rejestruje pełną listę funkcji.
 *   - 'pgboss' — enqueue idzie do kolejek pg-boss w naszym Postgresie,
 *     /api/inngest rejestruje pustą listę (crony Inngest Cloud gasną).
 *
 * Rollback = flip env + restart. Nigdy oba backendy naraz — konstrukcyjnie.
 */

export type JobsBackend = 'inngest' | 'pgboss';

export function getJobsBackend(): JobsBackend {
  return process.env.JOBS_BACKEND?.trim() === 'pgboss' ? 'pgboss' : 'inngest';
}

export function isPgBossBackend(): boolean {
  return getJobsBackend() === 'pgboss';
}

/**
 * Connection string do Postgresa dla pg-boss (schemat `pgboss` obok `public`).
 * Wymagany TYLKO przez worker i enqueue w trybie pgboss — stąd błąd dopiero
 * przy użyciu, nie przy imporcie modułu.
 */
export function getJobsDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL nie ustawiony — wymagany dla backendu pg-boss (worker/enqueue).',
    );
  }
  return url;
}

/** Port healthchecku HTTP workera (Coolify + ewentualny push do Kumy). */
export function getWorkerHealthPort(): number {
  const raw = process.env.WORKER_HEALTH_PORT?.trim();
  const port = raw ? Number(raw) : 8080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Niepoprawny WORKER_HEALTH_PORT: ${raw}`);
  }
  return port;
}
