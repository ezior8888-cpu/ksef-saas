/**
 * Status page data API (Faza 27).
 *
 * Zwraca per-komponent status w formacie zgodnym z Better Uptime / Statuspage.io.
 * Każdy komponent ma status: `operational` | `degraded` | `down` + opcjonalny
 * response time (ms).
 *
 * Komponenty:
 *   - `database`  — Supabase Postgres ping (`SELECT 1`)
 *   - `ksef`      — z Fazy 23 `getKsefHealthSnapshot` (Redis-cached, latency ~5ms)
 *   - `stripe`    — Stripe Charges list (małe API call, sprawdza dostępność)
 *   - `inngest`   — sprawdza `INNGEST_EVENT_KEY` (env-level, bez round-trip)
 *
 * Public endpoint — bez auth. Może być cache'owany na CDN 30s (`s-maxage=30`)
 * — Better Uptime sample co 1 min, nie potrzebuje świeżego stanu sekunda-po-sekundzie.
 */

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { getKsefHealthSnapshot } from '@/lib/ksef/health-status';
import { isStripeConfigured } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import type { KsefEnvironment } from '@/types/ksef';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ComponentStatus = 'operational' | 'degraded' | 'down';

interface ComponentReport {
  id: string;
  name: string;
  status: ComponentStatus;
  responseTimeMs: number | null;
  lastCheckedAt: string;
  /** Opcjonalny human-readable detail (np. "MF outage" gdy KSeF down). */
  detail?: string;
}

async function checkDatabase(): Promise<ComponentReport> {
  const started = Date.now();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('tenants').select('id').limit(1);
    const responseTimeMs = Date.now() - started;
    if (error) {
      return {
        id: 'database',
        name: 'Database',
        status: 'down',
        responseTimeMs,
        lastCheckedAt: new Date().toISOString(),
        detail: 'Query failed',
      };
    }
    return {
      id: 'database',
      name: 'Database',
      status: responseTimeMs > 1000 ? 'degraded' : 'operational',
      responseTimeMs,
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'status.database' } });
    return {
      id: 'database',
      name: 'Database',
      status: 'down',
      responseTimeMs: null,
      lastCheckedAt: new Date().toISOString(),
      detail: 'Connection error',
    };
  }
}

function currentKsefEnv(): KsefEnvironment {
  const env = process.env.KSEF_ENV ?? 'test';
  if (env === 'production' || env === 'test' || env === 'demo') {
    return env;
  }
  return 'test';
}

async function checkKsef(): Promise<ComponentReport> {
  try {
    const snapshot = await getKsefHealthSnapshot(currentKsefEnv());
    if (!snapshot) {
      // Brak snapshot'a = cron health monitor jeszcze nie pingnął.
      // Nie jest to "down" per se — UI Better Uptime pokaże "no data".
      return {
        id: 'ksef',
        name: 'KSeF API',
        status: 'operational',
        responseTimeMs: null,
        lastCheckedAt: new Date().toISOString(),
        detail: 'No recent ping (cron starting up)',
      };
    }
    return {
      id: 'ksef',
      name: 'KSeF API',
      status: snapshot.level,
      responseTimeMs: snapshot.responseTimeMs,
      lastCheckedAt: snapshot.lastCheckedAt,
      detail: snapshot.isMfOutage
        ? 'MF zgłasza globalną awarię'
        : snapshot.error ?? undefined,
    };
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'status.ksef' } });
    return {
      id: 'ksef',
      name: 'KSeF API',
      status: 'down',
      responseTimeMs: null,
      lastCheckedAt: new Date().toISOString(),
      detail: 'Snapshot lookup failed',
    };
  }
}

async function checkStripe(): Promise<ComponentReport> {
  if (!isStripeConfigured()) {
    return {
      id: 'stripe',
      name: 'Stripe',
      status: 'operational',
      responseTimeMs: null,
      lastCheckedAt: new Date().toISOString(),
      detail: 'Not configured (skip)',
    };
  }

  const started = Date.now();
  try {
    const { getStripe } = await import('@/lib/stripe/client');
    // Lightweight call — list 1 charge. Sprawdza auth + connectivity bez
    // kosztu wysłania prawdziwej operacji.
    await getStripe().charges.list({ limit: 1 });
    const responseTimeMs = Date.now() - started;
    return {
      id: 'stripe',
      name: 'Stripe',
      status: responseTimeMs > 2000 ? 'degraded' : 'operational',
      responseTimeMs,
      lastCheckedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      id: 'stripe',
      name: 'Stripe',
      status: 'down',
      responseTimeMs: Date.now() - started,
      lastCheckedAt: new Date().toISOString(),
      detail: err instanceof Error ? err.message.slice(0, 100) : 'API error',
    };
  }
}

function checkInngest(): ComponentReport {
  // Inngest nie ma cheap health endpoint — sprawdzamy tylko env config.
  // Realne issues (event delivery delay) wychodzą w `inngest_run_log`.
  const configured = Boolean(process.env.INNGEST_EVENT_KEY?.trim());
  return {
    id: 'inngest',
    name: 'Background jobs',
    status: configured ? 'operational' : 'down',
    responseTimeMs: null,
    lastCheckedAt: new Date().toISOString(),
    detail: configured ? undefined : 'INNGEST_EVENT_KEY missing',
  };
}

export async function GET(): Promise<Response> {
  const [database, ksef, stripe] = await Promise.all([
    checkDatabase(),
    checkKsef(),
    checkStripe(),
  ]);
  const inngest = checkInngest();

  const components: ComponentReport[] = [database, ksef, stripe, inngest];

  // Overall status = worst of all components.
  const overallStatus: ComponentStatus = components.some((c) => c.status === 'down')
    ? 'down'
    : components.some((c) => c.status === 'degraded')
      ? 'degraded'
      : 'operational';

  return NextResponse.json(
    {
      status: overallStatus,
      components,
      generatedAt: new Date().toISOString(),
    },
    {
      status: overallStatus === 'down' ? 503 : 200,
      headers: {
        // Cache CDN 30s — Better Uptime sample max co 1 min, nie potrzebuje
        // świeższego niż 30s. Bez tego każda wizyta status page hituje DB+KSeF+Stripe.
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    },
  );
}
