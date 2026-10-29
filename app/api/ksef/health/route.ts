/**
 * GET /api/ksef/health — zwraca snapshot zdrowia KSeF API z Redis.
 *
 * Konsumowany przez baner KSeF w panelu (`ksef-health-banner-client.tsx`),
 * żeby user widział zmianę statusu bez odświeżania strony. Endpoint jest
 * publiczny: proxy przepuszcza go bez sesji i bez wywołań GoTrue
 * (`isNoSessionPath` w `lib/supabase/middleware.ts`). Stan infrastruktury MF
 * nie jest poufny; pole `error` (tekst dla operatora) nie wychodzi.
 *
 * Cache-Control: public, max-age=15 — wolno, bo proxy nie dokłada tu
 * `Set-Cookie`, więc odpowiedź jest taka sama dla każdego. Tyle samo trwa
 * pamięć w procesie (`getPublicKsefHealth`); Redis daje snapshotowi 90 s TTL.
 */

import { NextResponse } from 'next/server';

import { getPublicKsefHealth } from '@/lib/ksef/health-status';
import type { KsefEnvironment } from '@/types/ksef';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=15' };

function getCurrentEnv(): KsefEnvironment {
  const env = process.env.KSEF_ENV ?? 'test';
  if (env === 'production' || env === 'test' || env === 'demo') {
    return env;
  }
  return 'test';
}

export async function GET() {
  const env = getCurrentEnv();
  const health = await getPublicKsefHealth(env);

  // null = Redis nieskonfigurowany / cron jeszcze nie pingnął — UI traktuje
  // jako "no banner", a my zwracamy defaultowy operational.
  if (!health) {
    return NextResponse.json(
      {
        level: 'operational',
        lastCheckedAt: null,
        responseTimeMs: null,
        consecutiveFailures: 0,
        isMfOutage: false,
        env,
        stale: true,
      },
      { headers: CACHE_HEADERS },
    );
  }

  return NextResponse.json({ ...health, stale: false }, { headers: CACHE_HEADERS });
}
