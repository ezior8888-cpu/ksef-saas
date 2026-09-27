import { assertJobIdentity, InvoiceTenantMismatchError, requireInvoiceTenant } from './tenant-boundary';
/**
 * Inngest: cykliczna próba wysłania faktur z kolejki Trybu Offline24.
 */

import { cron } from 'inngest';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';

import { createAdminClient } from '@/lib/supabase/server';
import { checkKsefAvailability } from '@/lib/ksef/health-check';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { OFFLINE_QUEUE_OPEN_STATUSES } from '@/lib/ksef/offline-queue-status';
import { createProposal } from '@/lib/flo/proposals';
import {
  buildDeadlineProposal,
  buildOutageProposal,
  evaluateDeadline,
  evaluateOutage,
  nearestFutureDeadline,
} from '@/lib/flo/functions/ksef-outage';
import { calculateNextRetry } from '@/lib/ksef/idempotency';
import { isOfflineReplayableInvoice } from '@/lib/ksef/offline-replay';
import {
  getInvoiceForSubmit,
  updateInvoiceStatus,
} from '@/lib/supabase/admin-queries';

import {
  inngest,
  invoiceSubmitFailed,
  invoiceSubmitRequested,
  invoiceSubmitSucceeded,
} from '../client';

async function readOfflineInvoiceState(invoiceId: string, tenantId: string) {
  const { data, error } = await createAdminClient()
    .from('invoices')
    .select('ksef_status, ksef_environment, invoice_kind, invoice_type, fa3_data')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) throw new Error('Offline24 invoice state requires reconciliation');
  return data;
}

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-d.ts
 */
export async function runProcessOfflineQueue({ step, logger }: JobContext) {
    const environment = requireConfiguredKsefEnvironment();
    const blockedCount = await step.run(`count-environment-blocked-${environment}`, async () => {
      const { count, error } = await createAdminClient()
        .from('ksef_offline_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued')
        .or(`ksef_environment.is.null,ksef_environment.neq.${environment}`);
      if (error || count === null) throw new Error('Could not count KSeF environment-blocked offline rows');
      return count;
    });
    if (blockedCount > 0) {
      logger.error('Offline24 rows require environment reconciliation', {
        environment,
        blockedCount,
      });
    }
    if (environment === 'production') {
      const { count, error } = await createAdminClient()
        .from('ksef_offline_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued')
        .eq('ksef_environment', environment);
      if (error || count === null) throw new Error('Could not inspect PROD Offline24 rows');
      if (count > 0) {
        logger.error('PROD Offline24 QR is unverified; queued rows require manual reconciliation', {
          environment, queuedCount: count,
        });
      }
      return { skipped: true as const, reason: 'PROD Offline24 QR requires manual reconciliation' };
    }
    const health = await step.run(`check-ksef-health-${environment}`, () =>
      checkKsefAvailability(environment),
    );

    if (!health.available) {
      // Karta agenta (X-04). Awarię Ministerstwa wolno ogłosić dopiero
      // przy DWÓCH źródłach: monitorze i realnym kodzie 5xx z wysyłki.
      // Przy jednym mówimy, co widzimy, bez wskazywania winnego — spokój
      // oparty na kłamstwie kończy się utratą zaufania do wszystkiego.
      await step.run(`flo-outage-card-${environment}`, async () => {
        const supabase = createAdminClient();

        const { data: queued, error: queueError } = await supabase
          .from('ksef_offline_queue')
          .select('tenant_id, deadline')
          .in('status', [...OFFLINE_QUEUE_OPEN_STATUSES])
          .eq('ksef_environment', environment);

        // Błąd zapytania to NIE „pusta kolejka". Do 25.09 zapytanie pytało
        // o status 'pending', którego ten enum nie ma: Postgres je odrzucał,
        // błąd ginął, a karta awarii i ostrzeżenie o terminie nie powstały
        // ani razu.
        if (queueError) {
          throw new Error(`kolejka Offline24: ${queueError.message}`);
        }

        const byTenant = new Map<string, string[]>();
        for (const row of queued ?? []) {
          const id = row.tenant_id as string;
          byTenant.set(id, [...(byTenant.get(id) ?? []), String(row.deadline)]);
        }

        const now = new Date();

        for (const [tenantId, deadlines] of byTenant) {
          const verdict = evaluateOutage({
            monitorSaysDown: true,
            // Drugie źródło: `isMfOutage` ustawia health-check dopiero przy
            // odpowiedzi 5xx z samego KSeF — czyli na podstawie tego, co
            // Ministerstwo odpowiedziało, a nie tego, że cokolwiek padło.
            lastSubmitStatus: health.isMfOutage ? 503 : null,
            consecutiveFailures: deadlines.length,
            // Skoro ten cron się wykonuje, nasz worker żyje.
            ourWorkerHealthy: true,
          });

          const outage = buildOutageProposal({
            tenantId,
            verdict,
            queuedCount: deadlines.length,
            now,
          });
          if (outage) await createProposal(outage);

          // Najbliższy PRZYSZŁY termin decyduje o alarmie — po nim zostaje
          // tylko droga papierowa. Najstarszy bywa już przekroczony i wtedy
          // zasłaniałby alarm (recenzja ChatGPT nr 7).
          const soonest = nearestFutureDeadline(deadlines, now);
          if (soonest) {
            const alert = evaluateDeadline(soonest, now);
            const deadlineCard = buildDeadlineProposal({
              tenantId,
              alert,
              invoiceCount: deadlines.length,
              now,
            });
            if (deadlineCard) await createProposal(deadlineCard);
          }
        }
      });

      return {
        skipped: true as const,
        reason: 'KSeF unavailable',
        ksefError: health.error,
      };
    }

    const queueItems =
      (await step.run(`fetch-queue-items-${environment}`, async () => {
        const supabase = createAdminClient();
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('ksef_offline_queue')
          .select('*')
          .eq('status', 'queued')
          .eq('ksef_environment', environment)
          .lte('next_attempt_at', nowIso)
          .order('next_attempt_at', { ascending: true })
          .limit(10);
        if (error) throw new Error(error.message);
        return data ?? [];
      })) ?? [];

    if (!queueItems.length) {
      return { skipped: true as const, reason: 'Empty queue' };
    }

    const results: Array<{
      invoiceId: string;
      queueId?: string;
      status: string;
      error?: string;
    }> = [];

    for (const item of queueItems) {
      // Historical NULL or another environment requires manual reconciliation.
      // Check even when an Inngest step has replayed an old fetch result.
      if (item.ksef_environment !== environment) {
        results.push({ invoiceId: item.invoice_id, queueId: item.id, status: 'environment-review' });
        continue;
      }
      // Queue rows are tenant-writable; do not trust their invoice_id.
      try {
        await requireInvoiceTenant(item.invoice_id, item.tenant_id);
      } catch (error) {
        // A DB outage is not evidence of a corrupt row. Retry instead of quarantining.
        if (!(error instanceof InvoiceTenantMismatchError)) throw error;
        const { error: quarantineError } = await createAdminClient()
          .from('ksef_offline_queue')
          .update({ status: 'failed', last_error: 'QUEUE_INVOICE_OWNERSHIP_MISMATCH' })
          .eq('id', item.id)
          .eq('tenant_id', item.tenant_id)
          .eq('invoice_id', item.invoice_id)
          .eq('status', 'queued');
        if (quarantineError) throw new Error('Nie można odizolować błędnego wpisu kolejki');
        results.push({ invoiceId: item.invoice_id, queueId: item.id, status: 'ownership-mismatch' });
        continue;
      }
      const currentInvoice = await readOfflineInvoiceState(item.invoice_id, item.tenant_id);
      if (currentInvoice.ksef_status === 'accepted') {
        const { data: quarantined, error: quarantineError } = await createAdminClient()
          .from('ksef_offline_queue')
          .update({ status: 'failed', last_error: 'Accepted invoice requires manual reconciliation' })
          .eq('id', item.id)
          .eq('tenant_id', item.tenant_id)
          .eq('invoice_id', item.invoice_id)
          .eq('ksef_environment', environment)
          .eq('status', 'queued')
          .select('id').maybeSingle();
        if (quarantineError || !quarantined) throw new Error('Accepted Offline24 row requires reconciliation');
        logger.error('Offline24 queued row belongs to accepted invoice; manual reconciliation required', {
          invoiceId: item.invoice_id, environment,
          storedEnvironment: currentInvoice.ksef_environment ?? null,
        });
        results.push({ invoiceId: item.invoice_id, queueId: item.id, status: 'accepted-reconciliation' });
        continue;
      }
      if (!isOfflineReplayableInvoice(currentInvoice)) {
        const supabase = createAdminClient();
        const { error: invoiceError } = await supabase
          .from('invoices')
          .update({
            ksef_status: 'failed',
            last_error: 'Offline24 nie może odtworzyć danych tego dokumentu; wymagane ręczne uzgodnienie.',
            last_error_code: 'OFFLINE_SPECIAL_DOCUMENT',
          })
          .eq('id', item.invoice_id)
          .eq('tenant_id', item.tenant_id)
          .eq('ksef_status', 'offline_queued');
        if (invoiceError) throw new Error('Offline24 special invoice status requires reconciliation');
        const { data: quarantined, error: quarantineError } = await supabase
          .from('ksef_offline_queue')
          .update({ status: 'failed', last_error: 'OFFLINE_SPECIAL_DOCUMENT_REQUIRES_RECONCILIATION' })
          .eq('id', item.id)
          .eq('tenant_id', item.tenant_id)
          .eq('invoice_id', item.invoice_id)
          .eq('ksef_environment', environment)
          .eq('status', 'queued')
          .select('id').maybeSingle();
        if (quarantineError || !quarantined) throw new Error('Offline24 special invoice quarantine requires reconciliation');
        logger.error('Offline24 row cannot reconstruct legal invoice XML; manual reconciliation required', {
          invoiceId: item.invoice_id, queueId: item.id, environment,
        });
        results.push({ invoiceId: item.invoice_id, queueId: item.id, status: 'special-reconciliation' });
        continue;
      }
      const deadlinePassed = await step.run(
        `deadline-check-${item.id}`,
        () => new Date(item.deadline).getTime() < Date.now(),
      );

      if (deadlinePassed) {
        await step.run(`expire-offline-queue-${item.id}`, async () => {
          const supabase = createAdminClient();
          const { data: expired, error } = await supabase
            .from('ksef_offline_queue')
            .update({ status: 'expired', last_error: 'OFFLINE_DEADLINE_EXCEEDED' })
            .eq('id', item.id)
            .eq('tenant_id', item.tenant_id)
            .eq('invoice_id', item.invoice_id)
            .eq('ksef_environment', environment)
            .eq('status', 'queued')
            .select('id').maybeSingle();
          if (error || !expired) throw new Error('Offline24 expiry requires reconciliation');

          await updateInvoiceStatus(item.invoice_id, {
            ksef_status: 'failed',
            last_error: 'Przekroczono deadline Offline24',
            last_error_code: 'OFFLINE_DEADLINE_EXCEEDED',
            last_error_field: null,
            last_error_suggestion: null,
          }, item.tenant_id);
        });
        results.push({ invoiceId: item.invoice_id, status: 'expired' });
        continue;
      }

      try {
        const submitPayload = await step.run(`prep-submit-${item.id}`, async () => {
          const supabase = createAdminClient();

          const { data: tenant, error: tErr } = await supabase
            .from('tenants')
            .select('nip')
            .eq('id', item.tenant_id)
            .single();
          if (tErr || !tenant?.nip) {
            throw new Error(
              tenant ? 'Brak NIP dla tenanta' : `Tenant: ${tErr?.message}`,
            );
          }

          const invoice = await getInvoiceForSubmit(item.invoice_id, item.tenant_id);

          return {
            tenantId: item.tenant_id,
            invoiceId: item.invoice_id,
            nip: tenant.nip,
            invoice,
            offlineQueueId: item.id as string,
            idempotencyKey: item.idempotency_key as string,
          };
        });

        await step.run(`mark-offline-queue-sending-${item.id}`, async () => {
          const supabase = createAdminClient();
          const attempts = ((item.attempts as number | null | undefined) ?? 0) + 1;

          const { data: sending, error } = await supabase
            .from('ksef_offline_queue')
            .update({
              status: 'sending',
              attempts,
              last_attempt_at: new Date().toISOString(),
              next_attempt_at: calculateNextRetry(attempts).toISOString(),
            })
            .eq('id', item.id)
            .eq('tenant_id', item.tenant_id)
            .eq('invoice_id', item.invoice_id)
            .eq('ksef_environment', environment)
            .eq('status', 'queued')
            .select('id').maybeSingle();
          if (error || !sending) throw new Error('Offline24 sending transition requires reconciliation');
        });

        await step.sendEvent(
          `submit-from-offline-${item.id}`,
          invoiceSubmitRequested.create({
            tenantId: submitPayload.tenantId,
            invoiceId: submitPayload.invoiceId,
            nip: submitPayload.nip,
            environment,
            invoice: submitPayload.invoice,
            fromOfflineQueue: true,
            offlineQueueId: submitPayload.offlineQueueId,
            idempotencyKey: submitPayload.idempotencyKey,
          }),
        );

        results.push({
          queueId: item.id as string,
          invoiceId: item.invoice_id as string,
          status: 'submitted',
        });
      } catch (e) {
        const message =
          e instanceof Error ? e.message : String(e);
        results.push({
          invoiceId: item.invoice_id as string,
          queueId: item.id as string,
          status: 'prep_error',
          error: message,
        });
      }
    }

    return { processed: results.length, results };
}

export const processOfflineQueueJob = inngest.createFunction(
  {
    id: 'process-offline-queue',
    name: 'Procesowanie kolejki Offline24',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw */5 * * * *')],
  },
  async ({ step, logger, attempt }) =>
    runProcessOfflineQueue(toJobContext({ step, logger, attempt })),
);

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-d.ts
 */
export async function runOfflineQueueSuccess(data: Parameters<typeof invoiceSubmitSucceeded.create>[0], { step }: JobContext) {
    if (!data.fromOfflineQueue) {
      return { skipped: true as const, reason: 'not-from-offline' };
    }

    const { invoiceId, tenantId } = data;
    const environment = requireConfiguredKsefEnvironment();
    if (data.environment !== environment) {
      throw new Error('Offline24 success environment requires reconciliation');
    }
    assertJobIdentity(data.offlineQueueId, tenantId);
    await requireInvoiceTenant(invoiceId, tenantId);
    const invoice = await readOfflineInvoiceState(invoiceId, tenantId);
    if (invoice.ksef_status !== 'accepted' || invoice.ksef_environment !== environment) {
      throw new Error('Offline24 success without accepted invoice in this environment requires reconciliation');
    }

    await step.run('mark-queue-sent', async () => {
      const supabase = createAdminClient();
      const { data: updated, error } = await supabase
        .from('ksef_offline_queue')
        .update({ status: 'sent', last_error: null })
        .eq('id', data.offlineQueueId!)
        .eq('invoice_id', invoiceId)
        .eq('tenant_id', tenantId)
        .eq('ksef_environment', environment)
        .eq('status', 'sending')
        .select('id').maybeSingle();
      if (error || !updated) throw new Error('Offline24 success reference requires reconciliation');
    });

    return { success: true as const };
}

export const offlineQueueSuccessHandler = inngest.createFunction(
  {
    id: 'offline-queue-success-handler',
    name: 'Offline24: oznaczenie wysłanych po sukcesie',
    concurrency: { limit: 25 },
    triggers: [invoiceSubmitSucceeded],
  },
  async ({ event, step, logger, attempt }) =>
    runOfflineQueueSuccess(event.data as Parameters<typeof invoiceSubmitSucceeded.create>[0], toJobContext({ step, logger, attempt })),
);

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-d.ts
 */
export async function runOfflineQueueFailure(data: Parameters<typeof invoiceSubmitFailed.create>[0], { step, logger }: JobContext) {
    if (!data.fromOfflineQueue) {
      return { skipped: true as const, reason: 'not-from-offline' };
    }

    const { invoiceId, tenantId, error: errorMessage } = data;
    const environment = requireConfiguredKsefEnvironment();
    if (data.environment !== environment) {
      throw new Error('Offline24 failure environment requires reconciliation');
    }
    assertJobIdentity(data.offlineQueueId, tenantId);
    await requireInvoiceTenant(invoiceId, tenantId);
    const invoice = await readOfflineInvoiceState(invoiceId, tenantId);
    if (invoice.ksef_status === 'accepted') {
      const { data: quarantined, error: quarantineError } = await createAdminClient()
        .from('ksef_offline_queue')
        .update({ status: 'failed', last_error: 'Accepted invoice requires manual reconciliation' })
        .eq('id', data.offlineQueueId!)
        .eq('tenant_id', tenantId)
        .eq('invoice_id', invoiceId)
        .eq('ksef_environment', environment)
        .eq('status', 'sending')
        .select('id').maybeSingle();
      logger.error('Offline24 stale failure for accepted invoice requires manual reconciliation', {
        invoiceId, environment, storedEnvironment: invoice.ksef_environment ?? null,
        queueQuarantined: !quarantineError && Boolean(quarantined),
      });
      throw new Error('Offline24 failure for accepted invoice requires reconciliation');
    }
    if (environment === 'production' || !isOfflineReplayableInvoice(invoice)) {
      const code = environment === 'production'
        ? 'OFFLINE_PROD_QR_UNVERIFIED'
        : 'OFFLINE_SPECIAL_DOCUMENT';
      const reason = environment === 'production'
        ? 'Offline24 PROD wymaga uzgodnienia niezweryfikowanego kodu QR.'
        : 'Offline24 nie może odtworzyć danych tego dokumentu; wymagane ręczne uzgodnienie.';
      const supabase = createAdminClient();
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          ksef_status: 'failed',
          last_error: reason,
          last_error_code: code,
        })
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .eq('ksef_status', 'offline_queued');
      if (invoiceError) throw new Error('Offline24 special invoice failure status requires reconciliation');
      const { data: quarantined, error: quarantineError } = await supabase
        .from('ksef_offline_queue')
        .update({ status: 'failed', last_error: `${code}_REQUIRES_RECONCILIATION` })
        .eq('id', data.offlineQueueId!)
        .eq('tenant_id', tenantId)
        .eq('invoice_id', invoiceId)
        .eq('ksef_environment', environment)
        .eq('status', 'sending')
        .select('id').maybeSingle();
      if (quarantineError || !quarantined) throw new Error('Offline24 special invoice failure requires reconciliation');
      logger.error('Offline24 row cannot be safely retried; manual reconciliation required', {
        invoiceId, environment, code,
      });
      return { success: false as const, reason: 'special-reconciliation' as const };
    }

    await step.run('rollback-queue-status', async () => {
      const supabase = createAdminClient();

      const { data: row, error: selErr } = await supabase
        .from('ksef_offline_queue')
        .select('id, attempts, status')
        .eq('id', data.offlineQueueId!)
        .eq('ksef_environment', environment)
        .eq('invoice_id', invoiceId)
        .eq('tenant_id', tenantId)
        .eq('status', 'sending')
        .maybeSingle();
      if (selErr) throw new Error(selErr.message);
      if (!row?.id) {
        return { skippedNoRow: true as const };
      }

      const attempts = row.attempts ?? 1;

      // Błąd kończący: KSeF odrzucił treść albo brak danych dokumentu.
      // Ponowienie nic nie zmieni — zamykamy wpis i zostawiamy fakturze
      // status ustawiony przez job wysyłki ('rejected'), zamiast nadpisywać
      // go na 'offline_queued'.
      if (data.terminal) {
        const { data: closed, error: closeErr } = await supabase
          .from('ksef_offline_queue')
          .update({
            status: 'failed',
            last_error:
              errorMessage.length > 2000
                ? `${errorMessage.slice(0, 1997)}...`
                : errorMessage,
          })
          .eq('id', row.id)
          .eq('tenant_id', tenantId)
          .eq('invoice_id', invoiceId)
          .eq('ksef_environment', environment)
          .eq('status', 'sending')
          .select('id').maybeSingle();
        if (closeErr || !closed) throw new Error('Offline24 terminal failure requires reconciliation');
        return { closedTerminal: true as const };
      }

      const { data: updated, error: updQ } = await supabase
        .from('ksef_offline_queue')
        .update({
          status: 'queued',
          last_error:
            errorMessage.length > 2000
              ? `${errorMessage.slice(0, 1997)}...`
              : errorMessage,
          next_attempt_at: calculateNextRetry(attempts).toISOString(),
        })
        .eq('id', row.id)
        .eq('tenant_id', tenantId)
        .eq('invoice_id', invoiceId)
        .eq('ksef_environment', environment)
        .eq('status', 'sending')
        .select('id').maybeSingle();
      if (updQ || !updated) throw new Error('Offline24 failure reference requires reconciliation');

      try {
        await updateInvoiceStatus(invoiceId, {
        ksef_status: 'offline_queued',
        last_error:
          errorMessage.length > 5000
            ? `${errorMessage.slice(0, 4997)}...`
            : errorMessage,
        last_error_code: 'OFFLINE_SUBMIT_RETRY',
        last_error_field: null,
        last_error_suggestion: null,
        }, tenantId);
      } catch (updateError) {
        // A competing worker may have accepted the invoice after the queue CAS.
        // Quarantine the row so it cannot be retried as a new submission.
        await supabase.from('ksef_offline_queue')
          .update({ status: 'failed', last_error: 'Invoice status requires manual reconciliation' })
          .eq('id', row.id)
          .eq('tenant_id', tenantId)
          .eq('invoice_id', invoiceId)
          .eq('ksef_environment', environment)
          .eq('status', 'queued');
        throw updateError;
      }
    });

    return { success: true as const };
}

export const offlineQueueFailureHandler = inngest.createFunction(
  {
    id: 'offline-queue-failure-handler',
    name: 'Offline24: przywrócenie kolejki po błędzie submit',
    concurrency: { limit: 25 },
    triggers: [invoiceSubmitFailed],
  },
  async ({ event, step, logger, attempt }) =>
    runOfflineQueueFailure(event.data as Parameters<typeof invoiceSubmitFailed.create>[0], toJobContext({ step, logger, attempt })),
);
