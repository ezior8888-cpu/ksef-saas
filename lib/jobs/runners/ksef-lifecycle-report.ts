import { sendSlackAlert } from '@/lib/alerts/slack';
import type { JobContext } from '@/lib/jobs/registry';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Cron `cron.ksef-lifecycle-report` (07:30 Europe/Warsaw): dzienny raport
 * cyklu życia faktury dla operatora (PR 4b) — liczby per stan, naruszenia
 * strażnika per inwariant, akcje automatu i ludzi z ostatniej doby.
 * Kanał `metrics` (Slack; bez pilności — pilne idą z monitora alarmów).
 */

export const LIFECYCLE_REPORT_STATUSES = ['draft', 'queued', 'sending', 'offline_queued', 'failed', 'rejected'] as const;

export const LIFECYCLE_REPORT_ACTIONS = [
  'invoice.send_enqueued',
  'invoice.send_requeued',
  'invoice.send_reset',
  'invoice.enqueue_released',
  'invoice.operator_requeue',
  'invoice.operator_reconcile',
  'invoice.operator_reset',
] as const;

export interface LifecycleReportInput {
  statuses: Record<string, number>;
  accepted24h: number;
  violations: Record<string, number>;
  actions24h: Record<string, number>;
  /** Ponowienia bez aktora (cron) w ostatniej dobie. */
  autoRequeues24h: number;
}

/** Treść raportu — czysta funkcja do testów. */
export function formatLifecycleReport(input: LifecycleReportInput): string {
  const statusLine = LIFECYCLE_REPORT_STATUSES
    .map((s) => `${s} ${input.statuses[s] ?? 0}`)
    .join(' · ');
  const violationEntries = Object.entries(input.violations).sort(([a], [b]) => a.localeCompare(b));
  const violationLine = violationEntries.length === 0
    ? 'brak'
    : violationEntries.map(([inv, n]) => `${inv} ${n}`).join(' · ');
  const actionEntries = Object.entries(input.actions24h).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b));
  const actionLine = actionEntries.length === 0
    ? 'brak'
    : actionEntries.map(([a, n]) => `${a.replace('invoice.', '')} ${n}`).join(' · ');
  return [
    '*KSeF — cykl życia faktury, raport dzienny*',
    `Stany (wychodzące): ${statusLine}`,
    `Przyjęte w 24 h: ${input.accepted24h}`,
    `Naruszenia strażnika: ${violationLine}`,
    `Akcje w 24 h: ${actionLine}`,
    `Ponowienia automatu w 24 h: ${input.autoRequeues24h}`,
  ].join('\n');
}

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-a.ts (kolejka cron.ksef-lifecycle-report).
 */
export async function runKsefLifecycleReport({ step, logger }: JobContext): Promise<LifecycleReportInput> {
  const supabase = createAdminClient();
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const statuses = await step.run('count-statuses', async (): Promise<Record<string, number>> => {
    const results = await Promise.all(LIFECYCLE_REPORT_STATUSES.map((status) =>
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('direction', 'outgoing').eq('ksef_status', status)));
    const out: Record<string, number> = {};
    results.forEach((r, i) => {
      if (r.error) throw new Error(`Raport: nie można policzyć stanu ${LIFECYCLE_REPORT_STATUSES[i]}: ${r.error.message}`);
      out[LIFECYCLE_REPORT_STATUSES[i]!] = r.count ?? 0;
    });
    return out;
  });

  const accepted24h = await step.run('count-accepted-24h', async (): Promise<number> => {
    const { count, error } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'outgoing')
      .eq('ksef_status', 'accepted')
      .gte('ksef_accepted_at', sinceIso);
    if (error) throw new Error(`Raport: nie można policzyć przyjętych: ${error.message}`);
    return count ?? 0;
  });

  const violations = await step.run('count-violations', async (): Promise<Record<string, number>> => {
    const { data, error } = await supabase.rpc('ksef_lifecycle_violations');
    if (error) throw new Error(`ksef_lifecycle_violations: ${error.message}`);
    const out: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{ invariant: string }>) out[row.invariant] = (out[row.invariant] ?? 0) + 1;
    return out;
  });

  const { actions24h, autoRequeues24h } = await step.run('count-actions-24h', async () => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('action, user_id')
      .in('action', [...LIFECYCLE_REPORT_ACTIONS])
      .gte('created_at', sinceIso)
      .limit(5000);
    if (error) throw new Error(`Raport: nie można odczytać akcji: ${error.message}`);
    const counts: Record<string, number> = {};
    let auto = 0;
    for (const row of (data ?? []) as Array<{ action: string; user_id: string | null }>) {
      counts[row.action] = (counts[row.action] ?? 0) + 1;
      if (row.action === 'invoice.send_requeued' && row.user_id === null) auto += 1;
    }
    return { actions24h: counts, autoRequeues24h: auto };
  });

  const input: LifecycleReportInput = { statuses, accepted24h, violations, actions24h, autoRequeues24h };
  await step.run('send-report', () => sendSlackAlert({
    channel: 'metrics',
    text: formatLifecycleReport(input),
    context: {
      failed: statuses.failed ?? 0,
      rejected: statuses.rejected ?? 0,
      naruszenia: Object.values(violations).reduce((a, b) => a + b, 0),
    },
  }));
  logger.info('Cykl życia: raport dzienny wysłany', { ...input });
  return input;
}
