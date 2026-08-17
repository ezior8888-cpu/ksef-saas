/**
 * Singleton klienta pg-boss (schemat `pgboss` w NASZYM Postgresie na db-1).
 *
 * Lazy init — moduł można importować w kodzie apki bez DATABASE_URL
 * (błąd dopiero przy realnym użyciu w trybie pgboss).
 */

import { PgBoss } from 'pg-boss';

import { getJobsDatabaseUrl } from './config';

let cached: PgBoss | null = null;
let started = false;

export function getBoss(): PgBoss {
  if (!cached) {
    cached = new PgBoss({
      connectionString: getJobsDatabaseUrl(),
      schema: 'pgboss',
      application_name: 'faktflow-jobs',
      // Mała pula — worker to jeden proces; apka enqueue'uje krótkimi zapytaniami.
      max: 5,
    });
  }
  return cached;
}

/** Start (idempotentny) — wymagany przed send/work/schedule. */
export async function startBoss(): Promise<PgBoss> {
  const boss = getBoss();
  if (!started) {
    await boss.start();
    started = true;
  }
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (cached && started) {
    // graceful: dokończ aktywne joby (timeout wewnętrzny pg-boss).
    await cached.stop({ graceful: true, close: true });
    started = false;
    cached = null;
  }
}

/**
 * Tworzy kolejkę (idempotentnie) z `retryLimit: 0` — patrz lib/jobs/retry.ts:
 * cały retry robimy sami dla parytetu z Inngest (custom schedule, klasyfikacja
 * błędów). pg-boss nie może liczyć prób równolegle.
 */
export async function ensureQueue(name: string): Promise<void> {
  const boss = await startBoss();
  await boss.createQueue(name, { retryLimit: 0 });
}
