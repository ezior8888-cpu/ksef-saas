/**
 * Smoke test pg-boss (Etap 2 planu Etapu 7): łączy się z DATABASE_URL,
 * tworzy schemat/kolejkę, wysyła job, odbiera go i sprawdza payload.
 *
 * Użycie (przez tunel SSH do db-1, jak przy migracjach):
 *   DATABASE_URL='postgresql://postgres:...@127.0.0.1:55432/postgres?sslmode=disable' pnpm jobs:smoke
 */

import { PgBoss, type Job } from 'pg-boss';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error('✗ Brak DATABASE_URL');
    process.exit(1);
  }

  const boss = new PgBoss({
    connectionString: url,
    schema: 'pgboss',
    application_name: 'faktflow-jobs-smoke',
  });
  boss.on('error', (e: Error) => console.error('pg-boss error:', e));

  console.log('1/4 start (tworzy schemat pgboss przy pierwszym razie)...');
  await boss.start();

  const QUEUE = 'jobs.smoke';
  await boss.createQueue(QUEUE, { retryLimit: 0 });
  console.log('2/4 kolejka gotowa');

  const received = new Promise<{ ping: number }>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('timeout 20s — job nie dotarł')),
      20_000,
    );
    void boss.work<{ ping: number }>(
      QUEUE,
      async (jobs: Job<{ ping: number }>[]) => {
        clearTimeout(timer);
        resolve(jobs[0]!.data);
      },
    );
  });

  const sent = Date.now();
  await boss.send(QUEUE, { ping: sent });
  console.log('3/4 wysłano, czekam na odbiór...');

  const data = await received;
  if (data.ping !== sent) {
    throw new Error(`payload się nie zgadza: ${JSON.stringify(data)}`);
  }
  console.log(`4/4 ✅ odebrano poprawny payload (roundtrip ${Date.now() - sent}ms)`);

  await boss.stop({ close: true, graceful: false });
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ SMOKE FAIL:', err);
  process.exit(1);
});
