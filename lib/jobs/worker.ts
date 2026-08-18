/**
 * Entry point workera pg-boss (Etap 7 migracji Hetzner).
 *
 * Uruchomienie: `pnpm worker:dev` lokalnie / target `worker` w Dockerfile
 * na app-1 (drugi kontener z tego samego obrazu, obok apki Next).
 *
 * Co robi:
 *   1. startuje pg-boss (schemat `pgboss` w Postgresie na db-1),
 *   2. tworzy kolejki zarejestrowanych jobów (retryLimit:0 — retry nasze),
 *   3. rejestruje handlery przez wrapper retry (parytet z Inngest),
 *   4. planuje crony TYLKO dla zarejestrowanych kolejek cron.*,
 *   5. wystawia healthcheck HTTP (Coolify) na WORKER_HEALTH_PORT (def. 8080),
 *   6. graceful shutdown na SIGTERM/SIGINT.
 */

import { createServer } from 'node:http';

import type { Job } from 'pg-boss';

import { ensureQueue, startBoss, stopBoss } from './boss';
import { getJobsBackend, getWorkerHealthPort } from './config';
import { createJobLogger } from './logger';
import { CRON_JOBS, SMOKE_QUEUE } from './queues';
import {
  getRegisteredJobs,
  registerJob,
  retryPolicyFor,
  type JobDefinition,
} from './registry';
import { ATTEMPT_KEY, decideRetry, readAttempt } from './retry';
import { createJobStep } from './step-shim';

// Rejestracje paczek (side-effect imports) — Etapy 3-6 planu.
import './handlers/package-a';
import './handlers/package-b';
import './handlers/package-c';
import './handlers/package-d';

const log = createJobLogger('worker');

/** Kolejka smoke — weryfikacja fundamentu (Etap 1/2) i żywotności workera. */
registerJob<{ ping?: number }>({
  queue: SMOKE_QUEUE,
  handler: async (data, { logger }) => {
    logger.info('smoke: odebrano job', data);
    return { pong: data.ping ?? null, at: Date.now() };
  },
});

function wrapHandler(def: JobDefinition<never>) {
  const policy = retryPolicyFor(def);

  return async (jobs: Job<object>[]): Promise<void> => {
    for (const job of jobs) {
      const attempt = readAttempt(job.data);
      const jobLog = createJobLogger(`${def.queue}#${job.id.slice(0, 8)}`);

      // Walidacja payloadu na granicy (bez klucza technicznego __attempt).
      let data: unknown = job.data;
      if (def.schema) {
        const cleaned = { ...(job.data as Record<string, unknown>) };
        delete cleaned[ATTEMPT_KEY];
        const parsed = def.schema.safeParse(cleaned);
        if (!parsed.success) {
          jobLog.error('payload nie przeszedł walidacji — onExhausted', {
            issues: parsed.error.issues.slice(0, 3),
          });
          await def.onExhausted?.(
            new Error(`Niepoprawny payload: ${parsed.error.message}`),
            job.data as never,
            { step: createJobStep(jobLog), logger: jobLog, attempt },
          );
          continue;
        }
        data = parsed.data;
      }

      try {
        await def.handler(data as never, {
          step: createJobStep(jobLog),
          logger: jobLog,
          attempt,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const decision = decideRetry(error, attempt, policy);

        if (decision.action === 'retry') {
          jobLog.warn(
            `próba ${attempt + 1} padła — retry za ${decision.delayMs}ms`,
            error,
          );
          const boss = await startBoss();
          await boss.send(
            def.queue,
            { ...(job.data as object), [ATTEMPT_KEY]: decision.nextAttempt },
            { startAfter: Math.ceil(decision.delayMs / 1000) },
          );
          continue;
        }

        jobLog.error(`wyczerpane próby (${decision.reason})`, error);
        try {
          await def.onExhausted?.(error, data as never, {
            step: createJobStep(jobLog),
            logger: jobLog,
            attempt,
          });
        } catch (exhaustErr) {
          jobLog.error('onExhausted rzucił błąd', exhaustErr);
        }
        // Job kończy się jako "obsłużony" — pg-boss nie retryuje (retryLimit 0),
        // a decyzja co dalej należała do onExhausted (parytet z Inngest).
      }
    }
  };
}

async function main(): Promise<void> {
  log.info(`Worker startuje (JOBS_BACKEND=${getJobsBackend()})`);

  const boss = await startBoss();
  boss.on('error', (err) => log.error('pg-boss error', err));

  const defs = getRegisteredJobs();
  const registeredQueues = new Set(defs.map((d) => d.queue));

  for (const def of defs) {
    await ensureQueue(def.queue);
    await boss.work(
      def.queue,
      {
        batchSize: def.batchSize ?? 1,
        ...(def.groupConcurrency !== undefined
          ? { groupConcurrency: def.groupConcurrency }
          : {}),
      },
      wrapHandler(def),
    );
    log.info(`kolejka aktywna: ${def.queue}`);
  }

  let scheduled = 0;
  // WORKER_DISABLE_SCHEDULES=true: tryb testowy (lokalny worker przez tunel)
  // oraz pierwsza faza cutoveru — worker obsługuje kolejki, ale nie prowadzi
  // cronów, bo w tym czasie robi to jeszcze poprzedni backend.
  //
  // Samo pominięcie `schedule()` NIE wystarcza: wpisy z wcześniejszego startu
  // zostają w tabeli `pgboss.schedule` i pg-boss podejmie je natychmiast po
  // starcie dowolnej instancji, niezależnie od tej flagi. Dlatego przy
  // wyłączonych cronach kasujemy je jawnie — inaczej flaga daje złudzenie
  // bezpieczeństwa. (Sprawdzone bólem: przypadkowo uruchomiony worker
  // przepracował noc na cronach, mimo że nikt ich nie planował świadomie.)
  const schedulesDisabled = process.env.WORKER_DISABLE_SCHEDULES === 'true';
  if (schedulesDisabled) {
    for (const cron of CRON_JOBS) {
      await boss.unschedule(cron.queue);
    }
    log.warn(
      `WORKER_DISABLE_SCHEDULES=true — crony wyłączone, wyczyszczono ${CRON_JOBS.length} wpisów harmonogramu`,
    );
  }
  for (const cron of CRON_JOBS) {
    if (schedulesDisabled) break;
    if (!registeredQueues.has(cron.queue)) continue;
    await boss.schedule(cron.queue, cron.cron, {}, cron.tz ? { tz: cron.tz } : {});
    scheduled++;
  }
  log.info(
    `Gotowy: ${defs.length} kolejek, ${scheduled}/${CRON_JOBS.length} cronów zaplanowanych`,
  );

  const startedAt = Date.now();
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          queues: defs.length,
          crons: scheduled,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(getWorkerHealthPort(), () =>
    log.info(`healthcheck: http://0.0.0.0:${getWorkerHealthPort()}/health`),
  );

  const shutdown = async (signal: string) => {
    log.info(`${signal} — graceful shutdown...`);
    server.close();
    try {
      await stopBoss();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  log.error('Worker padł przy starcie', err);
  process.exit(1);
});
