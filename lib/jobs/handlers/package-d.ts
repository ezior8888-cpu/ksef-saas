/**
 * Paczka D (Etap 7.6): 9 jobów RDZENIA KSeF — serce produktu.
 *
 * Runnery żyją w lib/jobs/runners/* (sekwencja kroków `submit-invoice`
 * zweryfikowana przy etapie 7 jako identyczna z dawną wersją Inngest).
 *
 * ── Parytet limitów ──────────────────────────────────────────────
 * Inngest miał DWA mechanizmy per klucz: `concurrency` (ile naraz) oraz
 * `throttle` (ile na okno czasu). pg-boss ma natywne grupy (`groupConcurrency`),
 * ale nie ma throttle'a okiennego. Nie jest to regres, bo:
 *
 *   1. Throttle w Inngest istniał, ponieważ na Vercelu działało WIELE
 *      instancji i in-process rate-limiter (`lib/ksef/rate-limiter.ts`)
 *      nie obejmował ich wszystkich. Worker pg-boss to JEDEN proces —
 *      ten sam limiter staje się globalnie poprawny (komentarz w
 *      inbox-polling.ts wprost to zakłada).
 *   2. `groupConcurrency` per tenant/NIP nadal ogranicza równoległość.
 *   3. Klient KSeF ma własny rate-limiter i obsługę 429 (RetryAfterError),
 *      więc nawet chwilowy spike kończy się ponowieniem, nie błędem.
 *
 * Gdyby po cutover okazało się to za słabe (alert „429 z MF" w Sentry),
 * najprostsza korekta to zmniejszenie `batchSize`/`groupConcurrency`.
 */

import { runDownloadUpo } from '../runners/download-upo';
import { runInboxPolling, runInboxPollTenant } from '../runners/inbox-polling';
import {
  runOfflineQueueFailure,
  runOfflineQueueSuccess,
  runProcessOfflineQueue,
} from '../runners/process-offline-queue';
import { runSelfInvoicePayment } from '../runners/self-invoice-payment';
import {
  onSubmitInvoiceExhausted,
  runSubmitInvoice,
} from '../runners/submit-invoice';
import { runUpoRetryStale } from '../runners/upo-retry-stale';
import { parseDurationMs } from '../duration';
import {
  getKsefRetryDelay,
  KSEF_MAX_RETRIES,
  KSEF_TENANT_CONCURRENCY_LIMIT,
} from '../retry-schedule';
import { registerJob, type JobContext } from '../registry';

const DEFAULT_JOB_RETRIES = 4;

// ═══════════════════════════════════════════════════════════════
// WYSYŁKA FAKTURY DO KSeF — najważniejszy job w aplikacji
// ═══════════════════════════════════════════════════════════════
registerJob<Parameters<typeof runSubmitInvoice>[0]>({
  queue: 'invoice.submit.requested',
  maxRetries: KSEF_MAX_RETRIES,
  // Harmonogram 30s → 2m → 5m → 15m → 1h (Faza 23). Ta sama funkcja, której
  // używa job na Inngest — jedno źródło prawdy dla obu backendów.
  getDelayMs: (attempt) => parseDurationMs(getKsefRetryDelay(attempt)),
  groupConcurrency: KSEF_TENANT_CONCURRENCY_LIMIT, // limit per tenant
  // Kilka firm naraz (AUD-36); per firma pilnuje groupConcurrency (groupId = tenantId).
  localConcurrency: 5,
  handler: (data, ctx) => runSubmitInvoice(data, ctx),
  // Po wyczerpaniu prób: rejected / offline_queued / failed (Offline24).
  onExhausted: (error, data, ctx) => onSubmitInvoiceExhausted(error, data, ctx),
});

// ═══════════════════════════════════════════════════════════════
// UPO — potwierdzenia z KSeF
// ═══════════════════════════════════════════════════════════════
registerJob<Parameters<typeof runDownloadUpo>[0]>({
  queue: 'invoice.upo.requested',
  maxRetries: 5,
  groupConcurrency: 3, // per NIP (jak concurrency w Inngest) — groupId = NIP (AUD-92)
  localConcurrency: 3, // AUD-36
  handler: (data, ctx) => runDownloadUpo(data, ctx),
});

registerJob<Record<string, never>>({
  queue: 'cron.upo-retry-stale',
  maxRetries: DEFAULT_JOB_RETRIES,
  handler: (_data, ctx: JobContext) => runUpoRetryStale(ctx),
});

// ═══════════════════════════════════════════════════════════════
// SKRZYNKA — polling faktur przychodzących
// ═══════════════════════════════════════════════════════════════
registerJob<Record<string, never>>({
  queue: 'cron.inbox-polling',
  maxRetries: DEFAULT_JOB_RETRIES,
  handler: (_data, ctx: JobContext) => runInboxPolling(ctx),
});

registerJob<Parameters<typeof runInboxPollTenant>[0]>({
  queue: 'inbox.poll.tenant',
  maxRetries: 2,
  // Jeden przebieg na NIP (`groupId` z fan-outu): stan skrzynki (HWM) jest
  // per firma, a równoległe przebiegi dublowały powiadomienia (AUD-91).
  groupConcurrency: 1,
  // Kilka skrzynek naraz zamiast firma po firmie (AUD-36).
  localConcurrency: 4,
  handler: (data, ctx) => runInboxPollTenant(data, ctx),
});

// ═══════════════════════════════════════════════════════════════
// OFFLINE24 — parking faktur na czas awarii KSeF
// ═══════════════════════════════════════════════════════════════
registerJob<Record<string, never>>({
  queue: 'cron.process-offline-queue',
  maxRetries: DEFAULT_JOB_RETRIES,
  handler: (_data, ctx: JobContext) => runProcessOfflineQueue(ctx),
});

// Fan-out: te dwie kolejki dostają TEN SAM event co powiadomienia z paczki B
// (patrz EVENT_QUEUE_MAP) — nadawca publikuje do obu.
registerJob<Parameters<typeof runOfflineQueueSuccess>[0]>({
  queue: 'invoice.submit.succeeded.offline-queue',
  maxRetries: DEFAULT_JOB_RETRIES,
  batchSize: 25,
  handler: (data, ctx) => runOfflineQueueSuccess(data, ctx),
});

registerJob<Parameters<typeof runOfflineQueueFailure>[0]>({
  queue: 'invoice.submit.failed.offline-queue',
  maxRetries: DEFAULT_JOB_RETRIES,
  batchSize: 25,
  handler: (data, ctx) => runOfflineQueueFailure(data, ctx),
});

// ═══════════════════════════════════════════════════════════════
// SELF-INVOICING — nasza faktura VAT po opłaceniu subskrypcji
// ═══════════════════════════════════════════════════════════════
registerJob<Parameters<typeof runSelfInvoicePayment>[0]>({
  queue: 'billing.payment.succeeded',
  maxRetries: 3,
  groupConcurrency: 1, // per tenant
  handler: (data, ctx) => runSelfInvoicePayment(data, ctx),
});

