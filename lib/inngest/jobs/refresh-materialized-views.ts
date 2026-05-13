// Cron job: hourly REFRESH MATERIALIZED VIEW CONCURRENTLY dla dashboard KPI.
//
// Faza 21 (sekcja 21.3) — dashboard agreguje invoices w trybie real-time
// dla każdego usera, co dla większych tenantów (>10k faktur) zaczyna trwać
// >2s. Materialized view `mv_tenant_dashboard_summary` pre-agregowane,
// query `SELECT * FROM mv WHERE tenant_id = X` zwraca w <20ms.
//
// Trigger: co godzinę. Wybór 60min vs 15min: wartości KPI nie zmieniają
// drastycznie z minuty na minutę (faktury wystawia się max kilkanaście dziennie
// dla mikrofirm), a CONCURRENTLY refresh kosztuje ~5-15s wall-clock dla 1000+
// tenantów. Cache hit w aplikacji jest ważniejszy niż 1-godzinny stale-window.
//
// Concurrency: limit 1 — żeby równolegle uruchomione runy nie konkurowały
// o lock na MV (REFRESH CONCURRENTLY potrafi się serializować).

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';

interface RefreshResult {
  monthly_stats_ms: number;
  dashboard_summary_ms: number;
  refreshed_at: string;
}

export const refreshMaterializedViewsJob = inngest.createFunction(
  {
    id: 'refresh-materialized-views',
    name: 'DB: refresh dashboard materialized views',
    concurrency: { limit: 1 },
    // Co godzinę o pełnej godzinie — synchronizujemy z timezone PL żeby
    // operator widział w logach „00:00 / 01:00 / ..." zamiast UTC.
    triggers: [cron('TZ=Europe/Warsaw 0 * * * *')],
  },
  async ({ step }) => {
    const supabase = createAdminClient();

    const result = await step.run('refresh-views', async () => {
      // RPC zdefiniowany w 00042_phase21_performance.sql — `SECURITY DEFINER`
      // żeby Inngest mógł odpalić REFRESH bez explicit ownership na MV.
      // typesy bazy nie obejmują tej RPC dopóki nie regenerujemy
      // `types/database.ts` — typed access przez RPC name string + cast.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
      ) => Promise<{ data: RefreshResult | null; error: { message: string } | null }>)('refresh_dashboard_materialized_views');

      if (error) {
        throw new Error(`refresh_dashboard_materialized_views failed: ${error.message}`);
      }
      return data;
    });

    // Sentry breadcrumb — operator może w razie kłopotów odczytać czasy.
    Sentry.addBreadcrumb({
      category: 'db.refresh',
      level: 'info',
      message: 'materialized views refreshed',
      data: result ?? undefined,
    });

    // Alert gdy refresh trwa nieproporcjonalnie długo — wczesny sygnał
    // że MV puchnie i trzeba dorzucić partycjonowanie / drop starych danych.
    const monthlyMs = result?.monthly_stats_ms ?? 0;
    const summaryMs = result?.dashboard_summary_ms ?? 0;
    if (monthlyMs > 60_000 || summaryMs > 60_000) {
      Sentry.captureMessage('Materialized view refresh > 60s', {
        level: 'warning',
        extra: { monthlyMs, summaryMs },
      });
    }

    return result ?? { skipped: true as const };
  },
);
