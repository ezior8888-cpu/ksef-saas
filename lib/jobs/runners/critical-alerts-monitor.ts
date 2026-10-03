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
 *   5. **Refund reconciliation** — processing > 15 min lub reconciliation_required
 *   6. **Stale Stripe webhooks** — processing > 15 min lub failed
 *   7. **Stale dunning notifications** — sending starsze niż 15 min
 *   8. **Checkout claims** — creating > 15 min albo uncertain/held
 *   9. **Stale VAT enqueue** — faktura powiązana, ale brak potwierdzenia emisji > 15 min
 *  10. **KSeF reconciliation** — numer KSeF przy niezaakceptowanym statusie lub ROZ hold
 *  11. **Kopia bazy nieaktualna** — najnowsza udana kopia starsza niż 26 h (AUD-37)
 *  12. **Skrzynka KSeF zaległa** — firma bez przebiegu skrzynki > 6 h
 *  13. **Opłacone bez faktury VAT** — płatność Stripe > 60 min bez dokumentu (AUD-40)
 *  14. **KSeF sending bez wyniku** — faktura w `sending` > 15 min od przejęcia wysyłki (#71)
 *
 * Wszystkie progi konserwatywne — wolimy false-positive niż przegapić
 * critical incident. Operator może zignorować, ale nie chcemy gubić alertów.
 */

import * as Sentry from '@sentry/nextjs';

import { alertCritical } from '@/lib/alerts/slack';
import { backupAgeHours, isBackupStale, MAX_BACKUP_AGE_HOURS } from '@/lib/backup/freshness';
import { STALE_REFUND_OPERATION_MS } from '@/lib/billing/refund-operations';
import { reconcileExpiredOpenCheckoutAttempts } from '@/lib/stripe/checkout-reconcile';
import { cacheGet, cacheSet } from '@/lib/cache';
import { OFFLINE_QUEUE_OPEN_STATUSES } from '@/lib/ksef/offline-queue-status';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';

import type { JobContext } from '@/lib/jobs/registry';

const ALERT_DEDUP_TTL_SECONDS = 30 * 60; // 30 min
const ALERT_DEDUP_KEY_PREFIX = 'alerts:critical:lastsent';

/**
 * Znaczniki „wysłano” w pamięci procesu — bez Redisa (cała produkcja) cache
 * nic nie pamiętał i ten sam alarm szedł co 5 minut (N2). Monitor chodzi
 * w jednym, długo żyjącym procesie workera, więc pamięć procesu wystarcza;
 * restart workera najwyżej powtórzy alarm raz.
 */
const deliveredLocally = new Map<string, number>();

/**
 * Sprawdza czy ten typ alertu wysyłaliśmy w ciągu ostatnich 30 min.
 * Jeśli tak — pomiń. Nowy znacznik zapisujemy dopiero po potwierdzonym 2xx.
 */
export async function shouldSendAlert(alertKey: string): Promise<boolean> {
  const cacheKey = `${ALERT_DEDUP_KEY_PREFIX}:${alertKey}`;
  const until = deliveredLocally.get(cacheKey);
  if (until !== undefined && until > Date.now()) return false;
  const existing = await cacheGet<string>(cacheKey);
  return !existing;
}

/** Cache dedup only after the critical transport confirms a 2xx response. */
export async function markAlertDelivered(
  alertKey: string,
  ttlSeconds: number = ALERT_DEDUP_TTL_SECONDS,
): Promise<void> {
  const cacheKey = ALERT_DEDUP_KEY_PREFIX + ':' + alertKey;
  // Cache is fail-soft: a failed write can duplicate a later alert, but never
  // suppress a retry of an undelivered one.
  const stored = await cacheSet(cacheKey, new Date().toISOString(), ttlSeconds);
  // Cache niczego nie zapisał (brak Redisa albo jego awaria) — pamięć procesu (N2).
  if (stored === false) deliveredLocally.set(cacheKey, Date.now() + ttlSeconds * 1000);
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

  const shouldSend = await shouldSendAlert('ksef_down');
  if (!shouldSend) return { type: 'ksef_down', fired: false, reason: 'dedup' };

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

  await markAlertDelivered('ksef_down');
  return { type: 'ksef_down', fired: true };
}

async function checkOfflineQueueBacklog(): Promise<AlertCheckResult> {
  const environment = requireConfiguredKsefEnvironment();
  const { count, error } = await createAdminClient()
    .from('ksef_offline_queue')
    .select('id', { count: 'exact', head: true })
    .in('status', [...OFFLINE_QUEUE_OPEN_STATUSES])
    .eq('ksef_environment', environment);
  // A failed count is not an empty queue. The monitor reports the check error
  // to Sentry instead of silently hiding invoices with statutory deadlines.
  if (error || typeof count !== 'number') {
    throw error ?? new Error('Offline24 queue count unavailable');
  }
  if (count < 50) return { type: 'offline_backlog', fired: false };

  const dedupKey = 'offline_backlog:' + environment;
  if (!(await shouldSendAlert(dedupKey))) {
    return { type: 'offline_backlog', fired: false, reason: 'dedup' };
  }
  await alertCritical(
    'Offline24 queue rośnie: ' + count + ' otwartych wpisów',
    'Faktur czekających lub w trakcie wysyłki Offline24: ' + count + '. Sprawdź dostępność KSeF i recovery cron.',
    {
      fields: [
        { label: 'Queued + sending', value: String(count) },
        { label: 'KSeF env', value: environment },
      ],
      link: {
        label: 'Otwórz /admin/system',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/system',
      },
    },
  );
  await markAlertDelivered(dedupKey);
  return { type: 'offline_backlog', fired: true };
}

/** Legacy or cross-environment queue items must never silently disappear. */
export async function checkBlockedKsefOfflineQueue(): Promise<AlertCheckResult> {
  const environment = requireConfiguredKsefEnvironment();
  const filter = 'ksef_environment.is.null,ksef_environment.neq.' + environment;
  const supabase = createAdminClient();
  const [blocked, nearest] = await Promise.all([
    supabase.from('ksef_offline_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', [...OFFLINE_QUEUE_OPEN_STATUSES]).or(filter),
    supabase.from('ksef_offline_queue')
      .select('deadline')
      .in('status', [...OFFLINE_QUEUE_OPEN_STATUSES]).or(filter)
      .order('deadline', { ascending: true }).limit(1).maybeSingle(),
  ]);
  if (blocked.error || nearest.error || blocked.count === null) {
    throw blocked.error ?? nearest.error ?? new Error('Blocked Offline24 queue count unavailable');
  }
  if (blocked.count === 0) return { type: 'offline_environment_blocked', fired: false };
  if (!nearest.data?.deadline) throw new Error('Blocked Offline24 deadline unavailable');

  const dedupKey = 'offline_environment_blocked:' + environment;
  if (!(await shouldSendAlert(dedupKey))) {
    return { type: 'offline_environment_blocked', fired: false, reason: 'dedup' };
  }
  await alertCritical(
    'Offline24 wymaga uzgodnienia środowiska',
    'Co najmniej jeden oczekujący lub rozpoczęty wpis Offline24 nie ma potwierdzonego środowiska lub dotyczy innego środowiska. Nie wznawiaj go automatycznie; uzgodnij z KSeF i kolejkami przed zmianą konfiguracji.',
    {
      fields: [
        { label: 'Zablokowane', value: String(blocked.count) },
        { label: 'Najbliższy deadline', value: nearest.data.deadline },
        { label: 'KSeF env', value: environment },
      ],
      link: {
        label: 'Otwórz /admin/system',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/system',
      },
    },
  );
  await markAlertDelivered(dedupKey);
  return { type: 'offline_environment_blocked', fired: true };
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

  const shouldSend = await shouldSendAlert('inngest_failures');
  if (!shouldSend) return { type: 'inngest_failures', fired: false, reason: 'dedup' };

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

  await markAlertDelivered('inngest_failures');
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

  const shouldSend = await shouldSendAlert('payment_failures');
  if (!shouldSend) return { type: 'payment_failures', fired: false, reason: 'dedup' };

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

  await markAlertDelivered('payment_failures');
  return { type: 'payment_failures', fired: true };
}

/** Unresolved or stalled refunds stay blocked until an operator reconciles Stripe. */
export async function checkStaleRefundOperations(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - STALE_REFUND_OPERATION_MS).toISOString();
  const [processingResult, reconciliationResult] = await Promise.all([
    supabase
      .from('stripe_refund_operations')
      .select('payment_id', { count: 'exact', head: true })
      .eq('status', 'processing')
      .lt('created_at', cutoffIso),
    supabase
      .from('stripe_refund_operations')
      .select('payment_id', { count: 'exact', head: true })
      .eq('status', 'reconciliation_required'),
  ]);

  if (processingResult.error || reconciliationResult.error ||
      processingResult.count === null || reconciliationResult.count === null) {
    throw processingResult.error ?? reconciliationResult.error ??
      new Error('Refund operation counts unavailable');
  }
  const staleProcessing = processingResult.count;
  const needsReconciliation = reconciliationResult.count;
  if (staleProcessing + needsReconciliation === 0) {
    return { type: 'stale_refund_operations', fired: false };
  }

  const shouldSend = await shouldSendAlert('stale_refund_operations');
  if (!shouldSend) return { type: 'stale_refund_operations', fired: false, reason: 'dedup' };

  await alertCritical(
    'Zwroty Stripe wymagają uzgodnienia',
    'Co najmniej jedna operacja zwrotu utknęła w processing ponad 15 minut lub ma status reconciliation_required. Sprawdź płatność i zwroty w Stripe przed jakąkolwiek kolejną próbą; nie odblokowuj automatycznie.',
    {
      fields: [
        { label: 'Processing > 15 min', value: String(staleProcessing) },
        { label: 'Wymaga uzgodnienia', value: String(needsReconciliation) },
      ],
      link: {
        label: 'Otwórz panel administratora',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/support',
      },
    },
  );

  await markAlertDelivered('stale_refund_operations');
  return { type: 'stale_refund_operations', fired: true };
}

/** Review cases are independent of webhook receipts; processed means durably recorded. */
export async function checkOpenStripeFinancialCases(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const countCases = () => supabase
    .from('stripe_financial_cases')
    .select('stripe_object_id', { count: 'exact', head: true });
  const [quarantined, open, awaitingAdmin] = await Promise.all([
    countCases().eq('case_state', 'quarantined'),
    countCases().eq('case_state', 'open'),
    countCases().eq('case_state', 'awaiting_admin').lt('first_seen_at', cutoffIso),
  ]);

  if (quarantined.error || open.error || awaitingAdmin.error ||
      quarantined.count === null || open.count === null ||
      awaitingAdmin.count === null) {
    throw quarantined.error ?? open.error ?? awaitingAdmin.error ??
      new Error('Stripe financial case counts unavailable');
  }
  if (quarantined.count + open.count + awaitingAdmin.count === 0) {
    return { type: 'open_stripe_financial_cases', fired: false };
  }

  const shouldSend = await shouldSendAlert('open_stripe_financial_cases');
  if (!shouldSend) {
    return { type: 'open_stripe_financial_cases', fired: false, reason: 'dedup' };
  }

  await alertCritical(
    'Zwroty lub spory Stripe wymagają uzgodnienia',
    'Przejrzyj sprawy finansowe po pełnym ID w Stripe i bazie. Kwarantanna oznacza brak pewnego powiązania; nie zgaduj firmy, nie ponawiaj zwrotu i nie usuwaj blokady bez udokumentowanej decyzji.',
    {
      fields: [
        { label: 'Bez powiązania', value: String(quarantined.count) },
        { label: 'Powiązane, otwarte', value: String(open.count) },
        { label: 'Admin > 15 min', value: String(awaitingAdmin.count) },
      ],
      link: {
        label: 'Otwórz panel administratora',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/support',
      },
    },
  );
  await markAlertDelivered('open_stripe_financial_cases');
  return { type: 'open_stripe_financial_cases', fired: true };
}
/** A Customer create can succeed at Stripe even when its response is lost. */
export async function checkStaleStripeCustomerAttempts(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const countAttempts = () => supabase
    .from('stripe_customer_attempts')
    .select('id', { count: 'exact', head: true });
  const [creating, uncertain] = await Promise.all([
    countAttempts().eq('status', 'creating').lt('created_at', cutoffIso),
    countAttempts().eq('status', 'uncertain'),
  ]);

  if (creating.error || uncertain.error ||
      creating.count === null || uncertain.count === null) {
    throw creating.error ?? uncertain.error ??
      new Error('Stripe Customer attempt counts unavailable');
  }
  if (creating.count + uncertain.count === 0) {
    return { type: 'stale_stripe_customer_attempts', fired: false };
  }

  const shouldSend = await shouldSendAlert('stale_stripe_customer_attempts');
  if (!shouldSend) {
    return { type: 'stale_stripe_customer_attempts', fired: false, reason: 'dedup' };
  }
  await alertCritical(
    'Stripe Customer wymaga uzgodnienia',
    'Tworzenie Customer utknęło albo wynik Stripe jest niepewny. Sprawdź dokładny Customer i przypisanie do firmy; nie zwalniaj claimu ani nie ponawiaj tworzenia na podstawie samego czasu.',
    {
      fields: [
        { label: 'Creating > 15 min', value: String(creating.count) },
        { label: 'Niepewne', value: String(uncertain.count) },
      ],
      link: {
        label: 'Otwórz panel administratora',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/support',
      },
    },
  );
  await markAlertDelivered('stale_stripe_customer_attempts');
  return { type: 'stale_stripe_customer_attempts', fired: true };
}
/** A Checkout create can succeed at Stripe even when its response is lost. */
export async function checkStaleStripeCheckoutAttempts(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  try {
    await reconcileExpiredOpenCheckoutAttempts(cutoffIso);
  } catch (error) {
    // A failed check must leave the stale rows visible to the alert.
    Sentry.captureException(error, {
      tags: { area: 'billing.checkout.reconcile' },
    });
  }
  const countAttempts = () => supabase
    .from('stripe_checkout_attempts')
    .select('id', { count: 'exact', head: true });
  const [creating, uncertain, held, expiredOpen] = await Promise.all([
    countAttempts().eq('status', 'creating').lt('created_at', cutoffIso),
    countAttempts().eq('status', 'uncertain'),
    countAttempts().eq('status', 'held'),
    countAttempts().eq('status', 'open').lt('session_expires_at', cutoffIso),
  ]);

  if (creating.error || uncertain.error || held.error || expiredOpen.error ||
      creating.count === null || uncertain.count === null ||
      held.count === null || expiredOpen.count === null) {
    throw creating.error ?? uncertain.error ?? held.error ?? expiredOpen.error ??
      new Error('Stripe Checkout attempt counts unavailable');
  }
  if (creating.count + uncertain.count + held.count + expiredOpen.count === 0) {
    return { type: 'stale_stripe_checkout_attempts', fired: false };
  }

  const shouldSend = await shouldSendAlert('stale_stripe_checkout_attempts');
  if (!shouldSend) {
    return { type: 'stale_stripe_checkout_attempts', fired: false, reason: 'dedup' };
  }
  await alertCritical(
    'Checkout Stripe wymaga uzgodnienia',
    'Trwała próba Checkout utknęła, ma niepewny wynik lub minęła zapisana data wygaśnięcia. Świeży stan sesji potwierdź w Stripe. Nie usuwaj claimu ani nie ponawiaj utworzenia sesji bez dowodu.',
    {
      fields: [
        { label: 'Creating > 15 min', value: String(creating.count) },
        { label: 'Niepewne', value: String(uncertain.count) },
        { label: 'Wstrzymane', value: String(held.count) },
        { label: 'Open po terminie > 15 min', value: String(expiredOpen.count) },
      ],
      link: {
        label: 'Otwórz panel administratora',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/support',
      },
    },
  );
  await markAlertDelivered('stale_stripe_checkout_attempts');
  return { type: 'stale_stripe_checkout_attempts', fired: true };
}
/** A stopped webhook may already have emitted jobs. Never reset it automatically. */
export async function checkStaleStripeWebhookEvents(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [processingResult, failedResult, retryableResult] = await Promise.all([
    supabase
      .from('stripe_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'processing')
      .lt('received_at', cutoffIso),
    supabase
      .from('stripe_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'failed'),
    supabase
      .from('stripe_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'retryable')
      .lt('received_at', cutoffIso),
  ]);

  if (processingResult.error || failedResult.error || retryableResult.error ||
      processingResult.count === null || failedResult.count === null ||
      retryableResult.count === null) {
    throw processingResult.error ?? failedResult.error ?? retryableResult.error ??
      new Error('Stripe webhook receipt count unavailable');
  }
  const staleProcessing = processingResult.count;
  const failed = failedResult.count;
  const staleRetryable = retryableResult.count;
  if (staleProcessing + failed + staleRetryable === 0) {
    return { type: 'stale_stripe_webhooks', fired: false };
  }

  const shouldSend = await shouldSendAlert('stale_stripe_webhooks');
  if (!shouldSend) {
    return { type: 'stale_stripe_webhooks', fired: false, reason: 'dedup' };
  }

  await alertCritical(
    'Webhooki Stripe wymagają uzgodnienia',
    'Co najmniej jeden webhook Stripe utknął w processing/retryable ponad 15 minut lub ma status failed. Nie resetuj claimu i nie ponawiaj handlera bez sprawdzenia skutków w bazie, kolejce i Stripe.',
    {
      fields: [
        { label: 'Processing > 15 min', value: String(staleProcessing) },
        { label: 'Failed', value: String(failed) },
        { label: 'Retryable > 15 min', value: String(staleRetryable) },
      ],
      link: {
        label: 'Otwórz panel administratora',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/support',
      },
    },
  );

  await markAlertDelivered('stale_stripe_webhooks');
  return { type: 'stale_stripe_webhooks', fired: true };
}

/**
 * AUD-40: płatność opłacona ponad godzinę temu, a faktury VAT brak — np.
 * `FAKTFLOW_OPERATOR_TENANT_ID` nieustawione (job kończy „skipped”) albo job
 * padł przed utworzeniem dokumentu. Klient zapłacił, sprzedaż bez faktury.
 */
export async function checkPaidWithoutVatInvoice(): Promise<AlertCheckResult> {
  const cutoffIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await createAdminClient()
    .from('stripe_payments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'succeeded')
    .is('vat_invoice_id', null)
    .lt('paid_at', cutoffIso);

  if (error || count === null) {
    throw error ?? new Error('Paid-without-VAT count unavailable');
  }
  if (count === 0) return { type: 'paid_without_vat_invoice', fired: false };

  const shouldSend = await shouldSendAlert('paid_without_vat_invoice');
  if (!shouldSend) {
    return { type: 'paid_without_vat_invoice', fired: false, reason: 'dedup' };
  }

  await alertCritical(
    'Opłacone abonamenty bez faktury VAT',
    'Co najmniej jedna płatność Stripe jest opłacona ponad godzinę, a faktura VAT nie powstała. Sprawdź FAKTFLOW_OPERATOR_TENANT_ID i job self-invoice-payment; fakturę wystaw ręcznie, jeśli zadanie jej nie utworzy.',
    {
      fields: [
        { label: 'Płatności', value: String(count) },
        { label: 'Próg', value: '60 min' },
      ],
      link: {
        label: 'Otwórz panel administratora',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/support',
      },
    },
  );

  await markAlertDelivered('paid_without_vat_invoice');
  return { type: 'paid_without_vat_invoice', fired: true };
}

/** A KSeF send may have succeeded despite a lost response; never retry it blindly. */
export async function checkStaleKsefSendingInvoices(): Promise<AlertCheckResult> {
  const cutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  // The send claim writes submitted_to_ksef_at together with `sending`.
  // Invoice updated_at can change later, so it cannot age this claim reliably.
  // Legacy rows with no claim timestamp violate that invariant and also need
  // reconciliation, regardless of invoice updated_at or creation time.
  const supabase = createAdminClient();
  const [staleResult, missingClaimResult] = await Promise.all([
    supabase.from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('ksef_status', 'sending')
      .lt('submitted_to_ksef_at', cutoffIso),
    supabase.from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('ksef_status', 'sending')
      .is('submitted_to_ksef_at', null),
  ]);

  if (staleResult.error || missingClaimResult.error ||
      typeof staleResult.count !== 'number' ||
      typeof missingClaimResult.count !== 'number') {
    throw staleResult.error ?? missingClaimResult.error ??
      new Error('Stale KSeF sending invoice counts unavailable');
  }
  if (staleResult.count + missingClaimResult.count === 0) {
    return { type: 'stale_ksef_sending_invoices', fired: false };
  }

  const dedupKey = 'stale_ksef_sending_invoices';
  if (!(await shouldSendAlert(dedupKey))) {
    return { type: dedupKey, fired: false, reason: 'dedup' };
  }

  await alertCritical(
    'Wysyłka faktur do KSeF wymaga uzgodnienia',
    'Co najmniej jedna faktura pozostaje w sending ponad 15 minut od przejęcia wysyłki lub nie ma znacznika przejęcia. Sprawdź stan w KSeF i bazie przed zmianą statusu; nie ponawiaj wysyłki automatycznie.',
    {
      fields: [
        { label: 'Faktury > 15 min', value: String(staleResult.count) },
        { label: 'Brak znacznika wysyłki', value: String(missingClaimResult.count) },
        { label: 'Próg', value: '15 min' },
      ],
      link: {
        label: 'Otwórz /admin/system',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/system',
      },
    },
  );
  await markAlertDelivered(dedupKey);
  return { type: dedupKey, fired: true };
}

/** A linked VAT draft without a confirmed enqueue must never be resent blindly. */
export async function checkStaleBillingVatEnqueues(): Promise<AlertCheckResult> {
  const cutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  // The invoice and payment link are created in one DB transaction. Invoice
  // created_at is stable; payment.updated_at can move on later webhooks.
  const { count, error } = await createAdminClient()
    .from('stripe_payments')
    .select(
      'id, invoices!stripe_payments_vat_invoice_id_fkey!inner(created_at)',
      { count: 'exact', head: true },
    )
    .not('vat_invoice_id', 'is', null)
    .is('vat_invoice_submitted_at', null)
    .lt('invoices.created_at', cutoffIso);

  if (error || count === null) {
    throw error ?? new Error('Stale billing VAT enqueue count unavailable');
  }
  if (count === 0) return { type: 'stale_billing_vat_enqueues', fired: false };

  const shouldSend = await shouldSendAlert('stale_billing_vat_enqueues');
  if (!shouldSend) {
    return { type: 'stale_billing_vat_enqueues', fired: false, reason: 'dedup' };
  }

  await alertCritical(
    'Faktury VAT Stripe wymagają uzgodnienia z KSeF',
    'Co najmniej jedna płatność ma powiązaną fakturę VAT starszą niż 15 minut bez potwierdzenia emisji zlecenia. Ręcznie uzgodnij stan kolejki i KSeF przed zmianą znacznika; nie wysyłaj zlecenia automatycznie ponownie.',
    {
      fields: [
        { label: 'Faktury > 15 min', value: String(count) },
        { label: 'Próg', value: '15 min' },
      ],
      link: {
        label: 'Otwórz panel administratora',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/support',
      },
    },
  );

  await markAlertDelivered('stale_billing_vat_enqueues');
  return { type: 'stale_billing_vat_enqueues', fired: true };
}

/**
 * A KSeF number must not coexist with an unaccepted outgoing invoice. A ROZ
 * hold is an operator reconciliation state, not a rejection from KSeF. Count
 * both independently: one invoice can satisfy both predicates.
 */
export async function checkKsefReconciliationAnomalies(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const countOutgoing = () => supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'outgoing');
  const [acceptedMismatch, rozHold] = await Promise.all([
    countOutgoing()
      .not('ksef_number', 'is', null)
      .or('ksef_status.is.null,ksef_status.neq.accepted'),
    countOutgoing()
      .eq('last_error_code', 'ROZ_HOLD_RECONCILE')
      .or('ksef_status.is.null,ksef_status.neq.accepted'),
  ]);

  if (acceptedMismatch.error || rozHold.error ||
      acceptedMismatch.count === null || rozHold.count === null) {
    throw acceptedMismatch.error ?? rozHold.error ??
      new Error('KSeF reconciliation counts unavailable');
  }
  if (acceptedMismatch.count === 0 && rozHold.count === 0) {
    return { type: 'ksef_reconciliation', fired: false };
  }

  // A newly appearing category must alert immediately even if the other one
  // was delivered within the 30-minute dedup window.
  const alertKey = `ksef_reconciliation:${acceptedMismatch.count > 0 ? 'number' : 'none'}:${rozHold.count > 0 ? 'roz' : 'none'}`;
  const shouldSend = await shouldSendAlert(alertKey);
  if (!shouldSend) {
    return { type: 'ksef_reconciliation', fired: false, reason: 'dedup' };
  }

  await alertCritical(
    'Faktury wymagają ręcznego uzgodnienia z KSeF',
    'Numer KSeF przy statusie innym niż accepted lub lokalna blokada ROZ wymaga sprawdzenia dokumentu i stanu w KSeF. Nie oznacza to odrzucenia przez KSeF. Nie ponawiaj wysyłki ani nie zmieniaj statusu przed ręcznym uzgodnieniem.',
    {
      fields: [
        { label: 'Numer KSeF, status niezaakceptowany', value: String(acceptedMismatch.count) },
        { label: 'ROZ wstrzymane', value: String(rozHold.count) },
      ],
      link: {
        label: 'Otwórz panel administratora',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/support',
      },
    },
  );

  await markAlertDelivered(alertKey);
  return { type: 'ksef_reconciliation', fired: true };
}

/**
 * W3 / cykl życia faktury (PR 4b): naruszenia strażnika `ksef_lifecycle_violations()`
 * (00131). I1 i klasa transient mają automat w `cron.ksef-lifecycle-reconcile`;
 * reszta (I2 sending ponad dzierżawę, I3 accepted bez UPO/XML, I4 failed bez
 * kodu, I5 stary wpis sent, I9 failed z numerem) to praca operatora w /admin/ksef.
 */
export async function checkKsefLifecycleViolations(): Promise<AlertCheckResult> {
  const { data, error } = await createAdminClient().rpc('ksef_lifecycle_violations');
  if (error) throw new Error(`ksef_lifecycle_violations: ${error.message}`);
  const rows = (data ?? []) as Array<{ invariant: string }>;
  if (rows.length === 0) {
    return { type: 'ksef_lifecycle_violations', fired: false };
  }
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.invariant, (counts.get(row.invariant) ?? 0) + 1);
  const invariants = [...counts.keys()].sort();
  // Nowy inwariant ma alarmować od razu, nawet gdy inny poszedł w oknie dedup.
  const alertKey = `ksef_lifecycle_violations:${invariants.join('+')}`;
  if (!(await shouldSendAlert(alertKey))) {
    return { type: 'ksef_lifecycle_violations', fired: false, reason: 'dedup' };
  }
  await alertCritical(
    'Strażnik cyklu życia faktury: naruszenia',
    'Faktury w stanie sprzecznym z cyklem życia. I1 (queued bez zlecenia) i klasę transient naprawia cron ponowień; pozostałe wymagają operatora: I2 sending ponad dzierżawę, I3 accepted bez UPO/XML, I4 failed bez kodu z katalogu, I5 wpis sent starszy niż 48 h, I9 failed z numerem KSeF.',
    {
      fields: invariants.map((inv) => ({ label: inv, value: String(counts.get(inv)) })),
      link: {
        label: 'Otwórz /admin/ksef',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/ksef',
      },
    },
  );
  await markAlertDelivered(alertKey);
  return { type: 'ksef_lifecycle_violations', fired: true };
}

/** An uncertain email send must be reconciled before any new delivery. */
export async function checkStaleDunningNotifications(): Promise<AlertCheckResult> {
  const cutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error } = await createAdminClient()
    .from('billing_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'payment_failed')
    .eq('status', 'sending')
    .lt('sent_at', cutoffIso);

  if (error || count === null) {
    throw error ?? new Error('Stale dunning notification count unavailable');
  }
  if (count === 0) return { type: 'stale_dunning_notifications', fired: false };

  const shouldSend = await shouldSendAlert('stale_dunning_notifications');
  if (!shouldSend) {
    return { type: 'stale_dunning_notifications', fired: false, reason: 'dedup' };
  }

  await alertCritical(
    'Powiadomienia o nieudanej płatności wymagają uzgodnienia',
    'Co najmniej jedna próba wysyłki pozostaje w sending ponad 15 minut. Sprawdź aktualną płatność i wynik wysyłki w Resend przed zmianą statusu; nie ponawiaj wysyłki automatycznie.',
    {
      fields: [
        { label: 'Próby > 15 min', value: String(count) },
        { label: 'Próg', value: '15 min' },
      ],
      link: {
        label: 'Otwórz panel administratora',
        url: (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/admin/support',
      },
    },
  );

  await markAlertDelivered('stale_dunning_notifications');
  return { type: 'stale_dunning_notifications', fired: true };
}

/** Nieaktualna kopia nie budzi w nocy co 30 min — przypomnienie raz na 6 h. */
const STALE_BACKUP_DEDUP_TTL_SECONDS = 6 * 60 * 60;

/**
 * Najnowsza udana kopia bazy starsza niż 26 h (AUD-37). Łapie też cron, który
 * przestał się uruchamiać — wtedy snapshot nie zgłasza żadnej porażki.
 */
export async function checkStaleBackup(): Promise<AlertCheckResult> {
  const { data, error } = await createAdminClient()
    .from('backup_log')
    .select('started_at')
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const newestAt = (data as { started_at: string } | null)?.started_at ?? null;
  if (!isBackupStale(newestAt)) return { type: 'stale_backup', fired: false };

  const shouldSend = await shouldSendAlert('stale_backup');
  if (!shouldSend) return { type: 'stale_backup', fired: false, reason: 'dedup' };

  const age = backupAgeHours(newestAt);
  await alertCritical(
    'Kopia bazy jest nieaktualna',
    'Nocny snapshot bazy nie powstał. Sprawdź workera (kolejka cron.daily-db-snapshot), wpisy w backup_log i Sentry. Do czasu naprawy zrób kopię ręcznie według docs/runbooks/backup-restore.md.',
    {
      fields: [
        {
          label: 'Najnowsza udana kopia',
          value: age === null ? 'brak' : `${Math.floor(age)} h temu`,
        },
        { label: 'Próg', value: `${MAX_BACKUP_AGE_HOURS} h` },
      ],
    },
  );

  await markAlertDelivered('stale_backup', STALE_BACKUP_DEDUP_TTL_SECONDS);
  return { type: 'stale_backup', fired: true };
}

/** Skrzynka KSeF bez pełnego przebiegu dłużej niż tyle godzin = alarm. */
export const INBOX_STALE_HOURS = 6;

/**
 * Zaległość skrzynki KSeF (AUD-18). Firma z poświadczeniami, której HWM
 * skrzynki (`ksef_inbox_cursor.window_to`) jest starszy niż próg, albo która
 * od podpięcia KSeF nie ma żadnego pełnego przebiegu. Łapie padające
 * przebiegi, zatrzymany cron i zaległość po stronie MF — wcześniej
 * niekompletne pobranie było tylko linijką w logu. W alarmie liczby, bez NIP.
 */
export async function checkStaleInboxSync(): Promise<AlertCheckResult> {
  const supabase = createAdminClient();
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, ksef_verified_at')
    .not('ksef_credentials_encrypted', 'is', null);
  if (error) throw error;
  const withKsef = (tenants ?? []) as { id: string; ksef_verified_at: string | null }[];
  if (withKsef.length === 0) return { type: 'stale_inbox_sync', fired: false };

  const { data: cursors, error: cursorError } = await supabase
    .from('ksef_inbox_cursor')
    .select('tenant_id, window_to');
  if (cursorError) throw cursorError;
  const hwmByTenant = new Map(
    ((cursors ?? []) as { tenant_id: string; window_to: string | null }[])
      .map((row) => [row.tenant_id, row.window_to] as const),
  );

  const threshold = Date.now() - INBOX_STALE_HOURS * 60 * 60 * 1000;
  let stale = 0;
  let neverPolled = 0;
  for (const tenant of withKsef) {
    const hwm = hwmByTenant.get(tenant.id);
    if (hwm) {
      if (Date.parse(hwm) < threshold) stale += 1;
    } else if (tenant.ksef_verified_at && Date.parse(tenant.ksef_verified_at) < threshold) {
      neverPolled += 1;
    }
  }
  if (stale + neverPolled === 0) return { type: 'stale_inbox_sync', fired: false };

  const shouldSend = await shouldSendAlert('stale_inbox_sync');
  if (!shouldSend) return { type: 'stale_inbox_sync', fired: false, reason: 'dedup' };

  await alertCritical(
    'Skrzynka KSeF nie pobiera faktur',
    'Faktury kosztowe z KSeF nie są pobierane. Sprawdź kolejkę inbox.poll.tenant i cron.inbox-polling w workerze, Sentry i logi workera. Po naprawie skrzynka sama nadrobi zaległość od ostatniego pełnego przebiegu.',
    {
      fields: [
        { label: 'Firmy z zaległością', value: String(stale) },
        { label: 'Firmy bez żadnego przebiegu', value: String(neverPolled) },
        { label: 'Próg', value: `${INBOX_STALE_HOURS} h` },
      ],
    },
  );

  await markAlertDelivered('stale_inbox_sync');
  return { type: 'stale_inbox_sync', fired: true };
}

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runCriticalAlertsMonitor({ step }: JobContext) {
    const results = await Promise.all([
      step.run('check-ksef', () => checkKsefDowntime().catch(captureAndReturn('ksef_down'))),
      step.run('check-offline', () =>
        checkOfflineQueueBacklog().catch(captureAndReturn('offline_backlog')),
      ),
      step.run('check-offline-environment', () =>
        checkBlockedKsefOfflineQueue().catch(captureAndReturn('offline_environment_blocked')),
      ),
      step.run('check-inngest', () =>
        checkInngestFailures().catch(captureAndReturn('inngest_failures')),
      ),
      step.run('check-payments', () =>
        checkPaymentFailures().catch(captureAndReturn('payment_failures')),
      ),
      step.run('check-stale-refunds', () =>
        checkStaleRefundOperations().catch(captureAndReturn('stale_refund_operations')),
      ),
      step.run('check-stale-webhooks', () =>
        checkStaleStripeWebhookEvents().catch(captureAndReturn('stale_stripe_webhooks')),
      ),
      step.run('check-financial-cases', () =>
        checkOpenStripeFinancialCases().catch(captureAndReturn('open_stripe_financial_cases')),
      ),
      step.run('check-checkout-attempts', () =>
        checkStaleStripeCheckoutAttempts().catch(captureAndReturn('stale_stripe_checkout_attempts')),
      ),
      step.run('check-customer-attempts', () =>
        checkStaleStripeCustomerAttempts().catch(captureAndReturn('stale_stripe_customer_attempts')),
      ),
      step.run('check-stale-dunning-notifications', () =>
        checkStaleDunningNotifications().catch(captureAndReturn('stale_dunning_notifications')),
      ),
      step.run('check-stale-ksef-sending-invoices', () =>
        checkStaleKsefSendingInvoices().catch(captureAndReturn('stale_ksef_sending_invoices')),
      ),
      step.run('check-stale-billing-vat-enqueues', () =>
        checkStaleBillingVatEnqueues().catch(captureAndReturn('stale_billing_vat_enqueues')),
      ),
      step.run('check-paid-without-vat-invoice', () =>
        checkPaidWithoutVatInvoice().catch(captureAndReturn('paid_without_vat_invoice')),
      ),
      step.run('check-ksef-reconciliation', () =>
        checkKsefReconciliationAnomalies().catch(captureAndReturn('ksef_reconciliation')),
      ),
      step.run('check-ksef-lifecycle', () =>
        checkKsefLifecycleViolations().catch(captureAndReturn('ksef_lifecycle_violations')),
      ),
      step.run('check-stale-backup', () =>
        checkStaleBackup().catch(captureAndReturn('stale_backup')),
      ),
      step.run('check-stale-inbox-sync', () =>
        checkStaleInboxSync().catch(captureAndReturn('stale_inbox_sync')),
      ),
    ]);

    return {
      checked: results.length,
      fired: results.filter((r) => r.fired).length,
      details: results,
    };
}

function captureAndReturn(type: string): (err: unknown) => AlertCheckResult {
  return (err) => {
    Sentry.captureException(err, {
      tags: { area: 'observability.critical-alerts', alertType: type },
    });
    return { type, fired: false, reason: 'check-error' };
  };
}
