// Cron job: codzienny digest metryk biznesowych na Slack #metrics (Faza 31 Krok 7).
//
// Trigger: 06:00 PL codziennie — godzina przed startem dnia roboczego.
// Founder dostaje liczby zanim usiądzie do laptopa.
//
// Źródło danych: nasza DB przez `getAdminOverviewMetrics` (Faza 24 admin).
// PostHog NIE jest źródłem — chcemy niezależnej liczby (gdyby PostHog padł
// na dłużej, digest dalej działa). PostHog jest do exploracji w dashboardzie.

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { sendSlackAlert } from '@/lib/alerts/slack';
import { getAdminOverviewMetrics } from '@/lib/admin/metrics';
import { inngest } from '@/lib/inngest/client';

export const dailyAnalyticsDigestJob = inngest.createFunction(
  {
    id: 'daily-analytics-digest',
    name: 'Analytics: daily digest na Slack #metrics',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw 0 6 * * *')],
  },
  async ({ step }) => {
    const metrics = await step.run('collect-metrics', async () => {
      return await getAdminOverviewMetrics();
    });

    await step.run('send-slack', async () => {
      try {
        const ksefHealthLabel =
          metrics.ksefHealth?.level === 'operational'
            ? '✅ operational'
            : metrics.ksefHealth?.level === 'degraded'
              ? '🟡 degraded'
              : metrics.ksefHealth?.level === 'down'
                ? '❌ down'
                : 'unknown';

        await sendSlackAlert({
          channel: 'metrics',
          text: '📊 Daily digest — ostatnie 24h',
          context: {
            signups_24h: metrics.signups24h,
            new_tenants_7d: metrics.newTenants7d,
            invoices_issued_24h: metrics.invoicesIssued24h,
            invoices_accepted_24h: metrics.invoicesAccepted24h,
            offline_queued: metrics.offlineQueued,
            active_tenants: metrics.activeTenants,
            deleted_tenants: metrics.deletedTenants,
            pending_join_requests: metrics.pendingJoinRequests,
            ksef_level: ksefHealthLabel,
          },
        });
      } catch (err) {
        Sentry.captureException(err, {
          tags: { job: 'daily-analytics-digest' },
        });
        throw err;
      }
    });

    return {
      signups_24h: metrics.signups24h,
      invoices_accepted_24h: metrics.invoicesAccepted24h,
    };
  },
);
