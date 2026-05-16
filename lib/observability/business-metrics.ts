/**
 * Business metrics aggregator (Faza 27).
 *
 * Używane przez Daily summary cron (06:00 PL) + Weekly review cron (Mon 09:00 PL).
 * Każda funkcja przyjmuje period (dni) i zwraca agregat in-memory — żaden cache,
 * cronów jest 2 dziennie/tydzień, freshness > performance.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface DailyMetrics {
  /** ISO date range. */
  period: { from: string; to: string };

  // Acquisition
  signups: number;
  newTenants: number;

  // Activation
  onboardingCompletions: number;
  firstInvoiceCount: number;

  // Operations
  invoicesIssued: number;
  invoicesAccepted: number;
  invoicesFailed: number;
  invoicesOfflineQueued: number;
  ocrJobsCompleted: number;

  // KSeF health
  ksefDowntimeMinutes: number;
  ksefMaxConsecutiveFailures: number;

  // Errors
  totalAuditErrors: number;
  totalInngestFailures: number;

  // Billing (Faza 25)
  paymentsSucceeded: number;
  paymentsFailed: number;
  paymentsTotalGrossPln: number;
}

export async function getDailyMetrics(hours = 24): Promise<DailyMetrics> {
  const supabase = createAdminClient();
  const now = new Date();
  const fromIso = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
  const toIso = now.toISOString();

  // Wszystkie liczniki paralel — nie czekamy 10 zapytań sekwencyjnie.
  const [
    tenantsRes,
    invoicesRes,
    acceptedRes,
    failedRes,
    offlineRes,
    ocrRes,
    healthRes,
    inngestFailRes,
    paymentsRes,
    paymentsFailedRes,
  ] = await Promise.all([
    supabase
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fromIso),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'issued')
      .gte('created_at', fromIso),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'issued')
      .eq('ksef_status', 'accepted')
      .gte('created_at', fromIso),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .in('ksef_status', ['failed', 'rejected'])
      .gte('created_at', fromIso),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('ksef_status', 'offline_queued'),
    supabase
      .from('ocr_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', fromIso),
    supabase
      .from('ksef_health_log')
      .select('level, response_time_ms, consecutive_failures, recorded_at')
      .gte('recorded_at', fromIso)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('inngest_run_log')
      .select('id', { count: 'exact', head: true })
      .in('status', ['error', 'failed'])
      .gte('created_at', fromIso),
    supabase
      .from('stripe_payments')
      .select('amount_cents, status')
      .eq('status', 'succeeded')
      .gte('paid_at', fromIso),
    supabase
      .from('stripe_payments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', fromIso),
  ]);

  // KSeF downtime — sumujemy minuty spędzone w `down` level.
  const healthRows = (healthRes.data ?? []) as Array<{
    level: 'operational' | 'degraded' | 'down';
    response_time_ms: number | null;
    consecutive_failures: number;
    recorded_at: string;
  }>;

  let ksefDowntimeMs = 0;
  let maxConsecutiveFailures = 0;
  for (let i = 0; i < healthRows.length; i++) {
    const cur = healthRows[i]!;
    if (cur.consecutive_failures > maxConsecutiveFailures) {
      maxConsecutiveFailures = cur.consecutive_failures;
    }
    if (cur.level === 'down') {
      const next = healthRows[i + 1];
      const endMs = next ? new Date(next.recorded_at).getTime() : Date.now();
      ksefDowntimeMs += endMs - new Date(cur.recorded_at).getTime();
    }
  }

  // Sumuj gross w PLN (cents → PLN).
  const payments = (paymentsRes.data ?? []) as Array<{ amount_cents: number }>;
  const totalGrossCents = payments.reduce((s, p) => s + (p.amount_cents ?? 0), 0);

  // Signups: liczba nowych userów = approximation z nowych tenantów (każdy
  // onboarding kończy się tenant). `auth.users.created_at` wymagałoby
  // pełnego listUsers — w MVP wystarczy proxy.
  const newTenants = tenantsRes.count ?? 0;
  const signups = newTenants;

  return {
    period: { from: fromIso, to: toIso },
    signups,
    newTenants,
    // Onboarding completion = same value bo create org JEST ukończeniem onboardingu.
    onboardingCompletions: newTenants,
    // First invoice — proxy: tenants którzy mają invoice po onboardingu.
    // Pełna logika "first ever invoice for tenant" wymagałaby JOIN — pomijamy.
    firstInvoiceCount: 0,
    invoicesIssued: invoicesRes.count ?? 0,
    invoicesAccepted: acceptedRes.count ?? 0,
    invoicesFailed: failedRes.count ?? 0,
    invoicesOfflineQueued: offlineRes.count ?? 0,
    ocrJobsCompleted: ocrRes.count ?? 0,
    ksefDowntimeMinutes: Math.round(ksefDowntimeMs / 60000),
    ksefMaxConsecutiveFailures: maxConsecutiveFailures,
    totalAuditErrors: 0, // Reserved — będzie z Sentry API w Faza 27 follow-up
    totalInngestFailures: inngestFailRes.count ?? 0,
    paymentsSucceeded: payments.length,
    paymentsFailed: paymentsFailedRes.count ?? 0,
    paymentsTotalGrossPln: Math.round(totalGrossCents / 100),
  };
}

// ─── Weekly metrics ────────────────────────────────────────────────

export interface WeeklyMetrics extends DailyMetrics {
  // Business
  mrrPln: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  churnedSubscriptions: number;
  arpu: number; // Average Revenue Per User w PLN
}

export async function getWeeklyMetrics(): Promise<WeeklyMetrics> {
  const daily = await getDailyMetrics(7 * 24);

  const supabase = createAdminClient();

  // Active + trialing subscriptions snapshot.
  const result = (await (supabase as unknown as {
    from: (n: string) => {
      select: (c: string) => {
        in: (k: string, v: string[]) => Promise<{
          data: Array<{ plan: 'monthly' | 'annual'; status: string }> | null;
        }>;
      };
    };
  })
    .from('subscriptions')
    .select('plan, status')
    .in('status', ['active', 'trialing']));

  const subs = result.data ?? [];
  const active = subs.filter((s) => s.status === 'active').length;
  const trialing = subs.filter((s) => s.status === 'trialing').length;

  // MRR: monthly @ 49 PLN, annual @ 49 PLN (annual / 12).
  const monthlyCount = subs.filter((s) => s.status === 'active' && s.plan === 'monthly').length;
  const annualCount = subs.filter((s) => s.status === 'active' && s.plan === 'annual').length;
  const mrrPln = monthlyCount * 49 + annualCount * 49; // 49 zł/mc effective dla obu

  // Churn — canceled w ostatnich 7 dniach.
  const fromIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const churnRes = (await (supabase as unknown as {
    from: (n: string) => {
      select: (c: string, opts: { count: 'exact'; head: true }) => {
        eq: (k: string, v: string) => {
          gte: (k: string, v: string) => Promise<{ count: number | null }>;
        };
      };
    };
  })
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'canceled')
    .gte('canceled_at', fromIso));

  const churnedSubscriptions = churnRes.count ?? 0;

  const arpu = active > 0 ? Math.round(mrrPln / active) : 0;

  return {
    ...daily,
    mrrPln,
    activeSubscriptions: active,
    trialingSubscriptions: trialing,
    churnedSubscriptions,
    arpu,
  };
}
