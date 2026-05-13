/**
 * GET /api/ksef/health — zwraca snapshot zdrowia KSeF API z Redis.
 *
 * Konsumowany przez `<KsefHealthBannerPoller />` co 30s, żeby user widział
 * zmianę statusu bez odświeżania strony. Endpoint jest publiczny — info
 * o stanie infrastruktury MF nie jest poufne, a wymaganie auth tylko
 * skomplikowałoby caching na edge.
 *
 * Cache-Control: no-store — Redis już daje 90s TTL, browser cache by tylko
 * przeszkadzał (chcemy 30s polling polegać na świeżej wartości z Redisa).
 */

import { NextResponse } from 'next/server';

import { getKsefHealthSnapshot } from '@/lib/ksef/health-status';
import type { KsefEnvironment } from '@/types/ksef';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getCurrentEnv(): KsefEnvironment {
  const env = process.env.KSEF_ENV ?? 'test';
  if (env === 'production' || env === 'test' || env === 'demo') {
    return env;
  }
  return 'test';
}

export async function GET() {
  const env = getCurrentEnv();
  const snapshot = await getKsefHealthSnapshot(env);

  // null = Redis nieskonfigurowany / cron jeszcze nie pingnął — UI traktuje
  // jako "no banner", a my zwracamy defaultowy operational.
  if (!snapshot) {
    return NextResponse.json(
      {
        level: 'operational',
        lastCheckedAt: null,
        responseTimeMs: null,
        consecutiveFailures: 0,
        isMfOutage: false,
        error: null,
        env,
        stale: true,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { ...snapshot, stale: false },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
