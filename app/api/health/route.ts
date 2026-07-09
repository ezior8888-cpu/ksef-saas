import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import { getRedis, isRedisConfigured } from '@/lib/cache/redis';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint.
 * Sprawdza: Supabase DB, environment variables.
 *
 * Wywołuje np. UptimeRobot co kilka minut.
 *
 * UWAGA: zwracamy WYŁĄCZNIE { status: 'ok' | 'fail' } per check.
 * Dawniej zwracaliśmy `error.message` z Postgres / Supabase, co dla
 * niezalogowanego użytkownika dawało enumerację schematu bazy
 * (np. „relation \"tenants\" does not exist"). Detale lecą do Sentry.
 */
export async function GET() {
  const checks: Record<string, { status: 'ok' | 'fail' }> = {};

  const requiredEnvs = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'KSEF_CREDENTIALS_ENCRYPTION_KEY',
    'INNGEST_EVENT_KEY',
  ];
  const missing = requiredEnvs.filter((env) => !process.env[env]);
  checks.env = missing.length === 0 ? { status: 'ok' } : { status: 'fail' };
  if (missing.length > 0) {
    Sentry.captureMessage('health.env.missing', {
      level: 'error',
      extra: { missing },
    });
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('tenants').select('id').limit(1);
    if (error) {
      Sentry.captureMessage('health.database.fail', {
        level: 'error',
        extra: { code: error.code, hint: error.hint, message: error.message },
      });
      checks.database = { status: 'fail' };
    } else {
      checks.database = { status: 'ok' };
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { check: 'health.database' } });
    checks.database = { status: 'fail' };
  }

  // ROB-1: Redis check — informacyjny, NIE bramkuje ogólnego statusu.
  // Redis to cache (rate-limit, dashboard) z fail-open wszędzie, więc jego
  // awaria = degradacja, nie „app down". Przyda się jako smoke target przy
  // migracji M3 (Valkey). Gdy nieskonfigurowany — pomijamy (graceful).
  const informational: Record<string, { status: 'ok' | 'fail' | 'skipped' }> = {};
  if (isRedisConfigured()) {
    try {
      const pong = await getRedis().ping();
      informational.redis = { status: pong === 'PONG' ? 'ok' : 'fail' };
    } catch (error) {
      Sentry.captureException(error, { tags: { check: 'health.redis' } });
      informational.redis = { status: 'fail' };
    }
  } else {
    informational.redis = { status: 'skipped' };
  }

  // Status ogólny zależy WYŁĄCZNIE od checków krytycznych (env + database).
  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks,
      informational,
    },
    { status: allOk ? 200 : 503 },
  );
}
