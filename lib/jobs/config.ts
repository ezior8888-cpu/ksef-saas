/**
 * Konfiguracja backendu jobów (Etap 7: Inngest → pg-boss).
 *
 * `JOBS_BACKEND`:
 *   - 'pgboss' — enqueue idzie do kolejek pg-boss w naszym Postgresie,
 *     /api/inngest rejestruje pustą listę (crony Inngest Cloud gasną).
 *   - 'inngest' — ścieżka zapasowa: enqueue do Inngest Cloud, /api/inngest
 *     rejestruje pełną listę funkcji. Tylko jawnie.
 *
 * Brak albo literówka (krok 5 planu automatyzacji, AUD-09):
 *   - lokalnie i w testach (jawny sygnał nie-produkcji, `isBypassAllowedEnv`)
 *     → 'inngest' (Inngest Dev Server), jak dotąd;
 *   - wszędzie indziej → BŁĄD przy wysyłce zlecenia i starcie workera.
 *     Dawniej wybierało to Inngest — po odpięciu Inngest Cloud zlecenia
 *     (w tym wysyłki do KSeF) znikałyby po cichu, a faktura wisiałaby
 *     w „W kolejce”. Fail-closed tak jak bramki SEC-1: brak markera
 *     środowiska traktujemy jak produkcję.
 *
 * Rollback = flip env + restart. Nigdy oba backendy naraz — konstrukcyjnie.
 */

import { isBypassAllowedEnv } from '@/lib/security/environment';

export type JobsBackend = 'inngest' | 'pgboss';

/** Jawnie ustawiony backend albo `null` — bez wartości domyślnej i bez wyjątku. */
export function getExplicitJobsBackend(): JobsBackend | null {
  const raw = process.env.JOBS_BACKEND?.trim();
  return raw === 'pgboss' || raw === 'inngest' ? raw : null;
}

/**
 * Backend wynikający z konfiguracji albo `null`, gdy konfiguracja go nie
 * rozstrzyga. Bez wyjątku — dla miejsc, które nie mogą rzucać przy imporcie
 * (`/api/inngest`) albo raportują stan (`/api/health`).
 */
export function resolveJobsBackend(): JobsBackend | null {
  return getExplicitJobsBackend() ?? (isBypassAllowedEnv() ? 'inngest' : null);
}

export function getJobsBackend(): JobsBackend {
  const resolved = resolveJobsBackend();
  if (resolved) return resolved;
  throw new Error(
    `JOBS_BACKEND musi być jawnie ustawiony poza lokalnym środowiskiem ('pgboss'); ${
      process.env.JOBS_BACKEND?.trim() ? 'nieznana wartość' : 'brak zmiennej'
    }. Zlecenie NIE zostało wysłane.`,
  );
}

export function isPgBossBackend(): boolean {
  return getJobsBackend() === 'pgboss';
}

/**
 * Worker pg-boss ma prawo działać tylko przy `JOBS_BACKEND=pgboss`. Przy
 * `inngest` zaplanowałby crony, które prowadzi też Inngest Cloud (podwójne
 * przypomnienia, podwójny polling KSeF), a przy braku zmiennej zostawiałby
 * produkcję w stanie, w którym apka i worker mogą myśleć różnie.
 * Rollback na Inngest = zatrzymanie aplikacji workera w Coolify.
 */
export function assertPgBossWorkerBackend(): void {
  const explicit = getExplicitJobsBackend();
  if (explicit !== 'pgboss') {
    throw new Error(
      `Worker pg-boss wymaga JOBS_BACKEND=pgboss (jest: ${
        explicit ?? 'brak lub nieznana wartość'
      }). Przy rollbacku na Inngest zatrzymaj workera zamiast go uruchamiać.`,
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
