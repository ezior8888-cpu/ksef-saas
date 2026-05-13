/**
 * Cron job: ping KSeF API co 30s, zapis wyniku w Redis (Faza 23 sekcja 1).
 *
 * Inngest natywnie wspiera tylko cron o granularności 1 minuta (cron syntax).
 * Dla 30s używamy fanout: jedna iteracja crona robi dwa pingi z `step.sleep(30s)`
 * pomiędzy. Concurrency: 1 — żeby dwie iteracje nie nadpisywały sobie nawzajem
 * statusu w Redis.
 *
 * Zakaz wpływu na DB ani logikę faktur: cron tylko czyta KSeF `/health`
 * i zapisuje snapshot w Redis. Nigdy nie pisze do `invoices`, `audit_logs`
 * ani innych tabel. Sygnał dla UI baner + sygnał dla `submit-invoice`
 * (decyzja "czy spróbować vs offline queue").
 */

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { inngest } from '@/lib/inngest/client';
import { checkKsefAvailability } from '@/lib/ksef/health-check';
import { recordKsefPing } from '@/lib/ksef/health-status';
import type { KsefEnvironment } from '@/types/ksef';

function getCurrentEnv(): KsefEnvironment {
  const env = process.env.KSEF_ENV ?? 'test';
  if (env === 'production' || env === 'test' || env === 'demo') {
    return env;
  }
  return 'test';
}

async function pingAndRecord(env: KsefEnvironment): Promise<void> {
  const result = await checkKsefAvailability(env);
  await recordKsefPing(env, {
    available: result.available,
    responseTimeMs: result.responseTime ?? null,
    isMfOutage: result.isMfOutage ?? false,
    error: result.error ?? null,
  });

  // Sentry breadcrumb na każde wykrycie down — operator widzi w UI Sentry
  // historię degradacji bez explicit'nego eventu (zbyt szumno).
  if (!result.available) {
    Sentry.addBreadcrumb({
      category: 'ksef.health',
      level: 'warning',
      message: 'KSeF ping failed',
      data: {
        env,
        responseTimeMs: result.responseTime,
        error: result.error,
        isMfOutage: result.isMfOutage,
      },
    });
  }
}

export const ksefHealthCheckJob = inngest.createFunction(
  {
    id: 'ksef-health-check',
    name: 'KSeF: health monitor (30s ping)',
    // Concurrency 1 — zapobiega race condition na counter consecutive failures.
    concurrency: { limit: 1 },
    // Co minutę uruchamiamy "podwójny" ping (0s + 30s) — efektywnie 30s cadence.
    triggers: [cron('TZ=Europe/Warsaw * * * * *')],
  },
  async ({ step }) => {
    const env = getCurrentEnv();

    // Pierwszy ping — natychmiast na starcie minuty.
    await step.run('ping-1', () => pingAndRecord(env));

    // Sleep 30s — Inngest serializuje step state, więc nawet jeśli runner
    // padnie w połowie, replay jest deterministyczny i nie zrobi się
    // ekstra pingu.
    await step.sleep('wait-30s', '30s');

    // Drugi ping — w połowie minuty.
    await step.run('ping-2', () => pingAndRecord(env));

    return { env, pingedAt: new Date().toISOString() };
  },
);
