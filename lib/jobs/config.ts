/**
 * Konfiguracja kolejki jobów.
 *
 * Jedyny backend to pg-boss w naszym Postgresie (etap 10, 02.10.2026:
 * Inngest odpięty — bez ścieżki powrotu). `JOBS_BACKEND` jest opcjonalny;
 * jeśli ustawiony, musi mieć wartość `pgboss`. Każda inna (także dawne
 * `inngest`) to błąd konfiguracji: zlecenie nie zostaje wysłane, a worker
 * nie startuje — zamiast udawać, że zadania gdzieś trafiają.
 */

export type JobsBackend = 'pgboss';

/** Backend z konfiguracji albo `null` przy nieznanej wartości — bez wyjątku (health). */
export function resolveJobsBackend(): JobsBackend | null {
  const raw = process.env.JOBS_BACKEND?.trim();
  return !raw || raw === 'pgboss' ? 'pgboss' : null;
}

export function getJobsBackend(): JobsBackend {
  const resolved = resolveJobsBackend();
  if (resolved) return resolved;
  throw new Error(
    "JOBS_BACKEND ma nieobsługiwaną wartość — jedyny backend to 'pgboss' (Inngest odpięty). Zlecenie NIE zostało wysłane.",
  );
}

/** Worker startuje tylko przy poprawnej konfiguracji kolejki. */
export function assertPgBossWorkerBackend(): void {
  if (!resolveJobsBackend()) {
    throw new Error(
      "Worker pg-boss: JOBS_BACKEND ma nieobsługiwaną wartość (dozwolone: brak albo 'pgboss').",
    );
  }
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
