/**
 * Critical alerts monitor (Faza 27).
 *
 * Cron co 5 minut. Sprawdza kilka progów i strzela Slack #urgent gdy
 * coś przekroczone. Idempotency: claim w Redis per typ alertu — nie
 * spamujemy tym samym alertem co 5 min, tylko raz na 30 min.
 *
 * Sprawdzamy:
 *   1. **KSeF down** >= 5 min (z `ksef_health_log` — Faza 23+24)
 *   2. **Offline24 queue rośnie** — > 50 pending invoices
 *   3. **Inngest job failures** — > 10 failed runs w ostatnich 5 min
 *   4. **Payment failures** — > 5 failed Stripe payments w ostatniej godzinie
 *
 * Wszystkie progi konserwatywne — wolimy false-positive niż przegapić
 * critical incident. Operator może zignorować, ale nie chcemy gubić alertów.
 */

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { alertCritical } from '@/lib/alerts/slack';
import { cacheGet, cacheSet } from '@/lib/cache';
import { createAdminClient } from '@/lib/supabase/admin';

import { inngest } from '../client';

const ALERT_DEDUP_TTL_SECONDS = 30 * 60; // 30 min
const ALERT_DEDUP_KEY_PREFIX = 'alerts:critical:lastsent';

/**
 * Sprawdza czy ten typ alertu wysyłaliśmy w ciągu ostatnich 30 min.
 * Jeśli tak — skip (deduplication). Inaczej claimuje i zwraca true.
 */
async function tryClaimAlert(alertKey: string): Promise<boolean> {
  const cacheKey = `${ALERT_DEDUP_KEY_PREFIX}:${alertKey}`;
  const existing = await cacheGet<string>(cacheKey);
  if (existing) return false;
  await cacheSet(cacheKey, new Date().toISOString(), ALERT_DEDUP_TTL_SECONDS);
  return true;
}

interface AlertCheckResult {
  type: string;
  fired: boolean;
  reason?: string;
}

async function checkKsefDowntime(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min window
  const { data } = await supabase
    .from('ksef_health_log')
    .select('level, recorded_at')
    .gte('recorded_at', cutoffIso)
    .order('recorded_at', { ascending: true });

  const rows = (data ?? []) as Array<{ level: string; recorded_at: string }>;
  if (rows.length === 0) return { type: 'ksef_down', fired: false };

  // Policz minut spędzonych w `down`.
  let downtimeMs = 0;
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i]!;
    if (cur.level !== 'down') continue;
    const next = rows[i + 1];
    const endMs = next ? new Date(next.recorded_at).getTime() : Date.now();
    downtimeMs += endMs - new Date(cur.recorded_at).getTime();
  }
  const downtimeMin = Math.round(downtimeMs / 60000);

  if (downtimeMin < 5) return { type: 'ksef_down', fired: false };

  const claimed = await tryClaimAlert('ksef_down');
  if (!claimed) return { type: 'ksef_down', fired: false, reason: 'dedup' };

  await alertCritical(
    `KSeF API niedostępny: ${downtimeMin} min w ostatnich 10 minutach`,
    `Health monitor wykrył *${downtimeMin}* minut "down" status w ostatnim 10-min oknie. Wysyłki faktur są przerzucane do Offline24 queue.`,
    {
      fields: [
        { label: 'Downtime', value: `${downtimeMin} min` },
        { label: 'Window', value: '10 min' },
      ],
      link: {
        label: 'Otwórz /admin/system',
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/admin/system`,
      },
    },
  );

  return { type: 'ksef_down', fired: true };
}

async function checkOfflineQueueBacklog(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('ksef_offline_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  const pending = count ?? 0;
  if (pending < 50) return { type: 'offline_backlog', fired: false };

  const claimed = await tryClaimAlert('offline_backlog');
  if (!claimed) return { type: 'offline_backlog', fired: false, reason: 'dedup' };

  await alertCritical(
    `Offline24 queue rośnie: ${pending} pending invoices`,
    `Faktur w Offline24 queue: *${pending}*. Może to znaczyć że KSeF jest dłużej niedostępne niż 5 min, lub że recovery cron padł.`,
    {
      fields: [{ label: 'Pending', value: String(pending) }],
      link: {
        label: 'Otwórz /admin/system',
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/admin/system`,
      },
    },
  );

  return { type: 'offline_backlog', fired: true };
}

async function checkInngestFailures(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('inngest_run_log')
    .select('*', { count: 'exact', head: true })
    .in('status', ['error', 'failed'])
    .gte('created_at', cutoffIso);

  const failures = count ?? 0;
  if (failures < 10) return { type: 'inngest_failures', fired: false };

  const claimed = await tryClaimAlert('inngest_failures');
  if (!claimed) return { type: 'inngest_failures', fired: false, reason: 'dedup' };

  await alertCritical(
    `${failures} Inngest job failures w ostatnich 5 min`,
    `Burst failures w background jobs — sprawdź który job pada.`,
    {
      fields: [
        { label: 'Failures (5min)', value: String(failures) },
        { label: 'Threshold', value: '10' },
      ],
      link: {
        label: 'Otwórz /admin/system',
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/admin/system`,
      },
    },
  );

  return { type: 'inngest_failures', fired: true };
}

async function checkPaymentFailures(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('stripe_payments')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('created_at', cutoffIso);

  const failures = count ?? 0;
  if (failures < 5) return { type: 'payment_failures', fired: false };

  const claimed = await tryClaimAlert('payment_failures');
  if (!claimed) return { type: 'payment_failures', fired: false, reason: 'dedup' };

  await alertCritical(
    `${failures} Stripe payment failures w ostatniej godzinie`,
    `Może to wskazywać na problem z Stripe API, błędne karty, lub fraud attempt.`,
    {
      fields: [
        { label: 'Failures (1h)', value: String(failures) },
        { label: 'Threshold', value: '5' },
      ],
      link: {
        label: 'Otwórz /admin/support',
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/admin/support`,
      },
    },
  );

  return { type: 'payment_failures', fired: true };
}

export const criticalAlertsMonitorJob = inngest.createFunction(
  {
    id: 'observability-critical-alerts-monitor',
    name: 'Observability: critical alerts monitor (co 5 min)',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw */5 * * * *')],
  },
  async ({ step }) => {
    const results = await Promise.all([
      step.run('check-ksef', () => checkKsefDowntime().catch(captureAndReturn('ksef_down'))),
      step.run('check-offline', () =>
        checkOfflineQueueBacklog().catch(captureAndReturn('offline_backlog')),
      ),
      step.run('check-inngest', () =>
        checkInngestFailures().catch(captureAndReturn('inngest_failures')),
      ),
      step.run('check-payments', () =>
        checkPaymentFailures().catch(captureAndReturn('payment_failures')),
      ),
    ]);

    return {
      checked: results.length,
      fired: results.filter((r) => r.fired).length,
      details: results,
    };
  },
);

function captureAndReturn(type: string): (err: unknown) => AlertCheckResult {
  return (err) => {
    Sentry.captureException(err, {
      tags: { area: 'observability.critical-alerts', alertType: type },
    });
    return { type, fired: false, reason: 'check-error' };
  };
}
