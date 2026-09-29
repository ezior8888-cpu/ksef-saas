import { InvoiceTenantMismatchError, requireInvoiceTenant } from './tenant-boundary';
/**
 * Inngest: cykliczna próba wysłania faktur z kolejki Trybu Offline24.
 */

import { cron } from 'inngest';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';

import { createAdminClient } from '@/lib/supabase/server';
import { checkKsefAvailability } from '@/lib/ksef/health-check';
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
import { isRozSubmission, ROZ_SUBMISSION_HOLD_MESSAGE } from '@/lib/ksef/roz-submission-hold';
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

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-d.ts
 */
export async function runProcessOfflineQueue({ step }: JobContext) {
    const health = await step.run('check-ksef-health', () =>
      checkKsefAvailability(),
    );

    if (!health.available) {
      // Karta agenta (X-04). Awarię Ministerstwa wolno ogłosić dopiero
      // przy DWÓCH źródłach: monitorze i realnym kodzie 5xx z wysyłki.
      // Przy jednym mówimy, co widzimy, bez wskazywania winnego — spokój
      // oparty na kłamstwie kończy się utratą zaufania do wszystkiego.
      await step.run('flo-outage-card', async () => {
        const supabase = createAdminClient();

        const { data: queued, error: queueError } = await supabase
          .from('ksef_offline_queue')
          .select('tenant_id, deadline')
          .in('status', [...OFFLINE_QUEUE_OPEN_STATUSES]);

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
      (await step.run('fetch-queue-items', async () => {
        const supabase = createAdminClient();
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('ksef_offline_queue')
          .select('*')
          .eq('status', 'queued')
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

      // An accepted invoice may have missed its success event. Heal the
      // durable queue row instead of submitting the same document again.
      const supabase = createAdminClient();
      const { data: invoiceState, error: invoiceStateError } = await supabase
        .from('invoices')
        .select('ksef_status, ksef_number, invoice_type, invoice_kind, last_error_code')
        .eq('id', item.invoice_id)
        .eq('tenant_id', item.tenant_id)
        .maybeSingle();
      if (invoiceStateError || !invoiceState) throw new Error('Nie można sprawdzić statusu faktury Offline24');
      if (invoiceState.ksef_status === 'accepted' && invoiceState.ksef_number) {
        const { error: reconcileError } = await supabase
          .from('ksef_offline_queue')
          .update({ status: 'sent', last_error: null })
          .eq('id', item.id)
          .eq('tenant_id', item.tenant_id)
          .eq('invoice_id', item.invoice_id)
          .eq('status', 'queued');
        if (reconcileError) throw new Error(reconcileError.message);
        results.push({ invoiceId: item.invoice_id, queueId: item.id, status: 'already-accepted' });
        continue;
      }
      if (isRozSubmission({
        storedInvoiceType: invoiceState.invoice_type,
        invoiceKind: invoiceState.invoice_kind,
      }) || invoiceState.last_error_code === 'ROZ_HOLD_RECONCILE') {
        const { error: holdError } = await supabase
          .from('ksef_offline_queue')
          .update({ status: 'failed', last_error: ROZ_SUBMISSION_HOLD_MESSAGE })
          .eq('id', item.id)
          .eq('tenant_id', item.tenant_id)
          .eq('invoice_id', item.invoice_id)
          .eq('status', 'queued');
        if (holdError) throw new Error(holdError.message);
        const { error: invoiceHoldError } = await supabase
          .from('invoices')
          .update({
            ksef_status: 'failed',
            last_error: ROZ_SUBMISSION_HOLD_MESSAGE,
            last_error_code: 'ROZ_HOLD_RECONCILE',
          })
          .eq('id', item.invoice_id)
          .eq('tenant_id', item.tenant_id)
          .or('ksef_status.is.null,ksef_status.neq.accepted');
        if (invoiceHoldError) throw new Error(invoiceHoldError.message);
        results.push({ invoiceId: item.invoice_id, queueId: item.id, status: 'held-roz' });
        continue;
      }
      const deadlinePassed = await step.run(
        `deadline-check-${item.id}`,
        () => new Date(item.deadline).getTime() < Date.now(),
      );

      if (deadlinePassed) {
        const expired = await step.run(`expire-offline-queue-${item.id}`, async () => {
          const supabase = createAdminClient();
          const { data: updated, error } = await supabase
            .from('ksef_offline_queue')
            .update({ status: 'expired', last_error: 'OFFLINE_DEADLINE_EXCEEDED' })
            .eq('id', item.id)
            .eq('tenant_id', item.tenant_id)
            .eq('invoice_id', item.invoice_id)
            .eq('status', 'queued')
            .select('id')
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!updated) return false;

          const { error: invoiceUpdateError } = await supabase
            .from('invoices')
            .update({
              ksef_status: 'failed',
              last_error: 'Przekroczono deadline Offline24',
              last_error_code: 'OFFLINE_DEADLINE_EXCEEDED',
              last_error_field: null,
              last_error_suggestion: null,
            })
            .eq('id', item.invoice_id)
            .eq('tenant_id', item.tenant_id)
            .or('ksef_status.is.null,ksef_status.neq.accepted');
          if (invoiceUpdateError) throw new Error(invoiceUpdateError.message);
          return true;
        });
        results.push({ invoiceId: item.invoice_id, status: expired === false ? 'state-changed' : 'expired' });
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

        const claimed = await step.run(`mark-offline-queue-sending-${item.id}`, async () => {
          const supabase = createAdminClient();
          const attempts = ((item.attempts as number | null | undefined) ?? 0) + 1;

          const { data: updated, error } = await supabase
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
            .eq('status', 'queued')
            .select('id')
            .maybeSingle();
          if (error) throw new Error(error.message);
          return updated?.id === item.id;
        });

        // Old Inngest checkpoints stored no return value for this step. A
        // fresh read also prevents a replay from sending after late success.
        const { data: queueState, error: queueStateError } = await createAdminClient()
          .from('ksef_offline_queue')
          .select('status')
          .eq('id', item.id)
          .eq('tenant_id', item.tenant_id)
          .eq('invoice_id', item.invoice_id)
          .maybeSingle();
        if (queueStateError) throw new Error(queueStateError.message);
        if (claimed === false || queueState?.status !== 'sending') {
          results.push({ invoiceId: item.invoice_id, queueId: item.id, status: 'state-changed' });
          continue;
        }

        await step.sendEvent(
          `submit-from-offline-${item.id}`,
          invoiceSubmitRequested.create({
            tenantId: submitPayload.tenantId,
            invoiceId: submitPayload.invoiceId,
            nip: submitPayload.nip,
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
    await requireInvoiceTenant(invoiceId, tenantId);

    await step.run('mark-queue-sent', async () => {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('ksef_offline_queue')
        .update({ status: 'sent', last_error: null })
        .eq('invoice_id', invoiceId)
        .eq('tenant_id', tenantId)
        // A late success must repair a row closed by an earlier failure event.
        .in('status', ['sending', 'failed', 'queued']);
      if (error) throw new Error(error.message);
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
export async function runOfflineQueueFailure(data: Parameters<typeof invoiceSubmitFailed.create>[0], { step }: JobContext) {
    if (!data.fromOfflineQueue) {
      return { skipped: true as const, reason: 'not-from-offline' };
    }

    const { invoiceId, tenantId, error: errorMessage } = data;
    await requireInvoiceTenant(invoiceId, tenantId);

    await step.run('rollback-queue-status', async () => {
      const supabase = createAdminClient();

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('ksef_status, ksef_number, last_error_code')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (invoiceError || !invoice) throw new Error('Nie można sprawdzić statusu faktury Offline24');
      if (invoice.ksef_status === 'accepted' && invoice.ksef_number) {
        const { error: reconcileError } = await supabase
          .from('ksef_offline_queue')
          .update({ status: 'sent', last_error: null })
          .eq('invoice_id', invoiceId)
          .eq('tenant_id', tenantId)
          .in('status', ['queued', 'sending', 'failed', 'expired']);
        if (reconcileError) throw new Error(reconcileError.message);
        return { skippedAccepted: true as const };
      }

      const heldRoz = data.manualReconciliationRequired || invoice.last_error_code === 'ROZ_HOLD_RECONCILE';

      const { data: row, error: selErr } = await supabase
        .from('ksef_offline_queue')
        .select('id, attempts, status')
        .eq('invoice_id', invoiceId)
        .eq('tenant_id', tenantId)
        .in('status', heldRoz ? ['sending', 'queued'] : ['sending'])
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
      if (data.terminal || heldRoz) {
        const { error: closeErr } = await supabase
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
          .in('status', heldRoz ? ['sending', 'queued'] : ['sending']);
        if (closeErr) throw new Error(closeErr.message);
        return { closedTerminal: true as const };
      }

      const { data: queued, error: updQ } = await supabase
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
        .eq('status', 'sending')
        .select('id')
        .maybeSingle();
      if (updQ) throw new Error(updQ.message);
      if (!queued) return { skippedQueueChanged: true as const };

      // Another worker can record acceptance after the read above. Do not
      // turn an accepted invoice back into a queued one.
      const invoiceUpdate = supabase
        .from('invoices')
        .update({
          ksef_status: 'offline_queued',
          last_error:
            errorMessage.length > 5000
              ? `${errorMessage.slice(0, 4997)}...`
              : errorMessage,
          last_error_code: 'OFFLINE_SUBMIT_RETRY',
          last_error_field: null,
          last_error_suggestion: null,
        })
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .or('ksef_status.is.null,ksef_status.neq.accepted');
      // Compare the error code read above. A newer ROZ hold must win over
      // an older transient failure event, including when it lands mid-handler.
      if (invoice.last_error_code == null) {
        invoiceUpdate.is('last_error_code', null);
      } else {
        invoiceUpdate.eq('last_error_code', invoice.last_error_code);
      }
      const { data: updatedInvoice, error: invoiceUpdateError } = await invoiceUpdate
        .select('id')
        .maybeSingle();
      if (invoiceUpdateError) throw new Error(invoiceUpdateError.message);
      if (!updatedInvoice) {
        const { data: latest, error: latestError } = await supabase
          .from('invoices')
          .select('ksef_status, ksef_number, last_error_code')
          .eq('id', invoiceId)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (latestError || !latest) throw new Error('Nie można uzgodnić statusu faktury Offline24');
        const resolvedStatus = latest.ksef_status === 'accepted' && latest.ksef_number
          ? 'sent'
          : latest.last_error_code === 'ROZ_HOLD_RECONCILE'
            ? 'failed'
            : null;
        if (resolvedStatus) {
          const { error: reconcileError } = await supabase
            .from('ksef_offline_queue')
            .update({ status: resolvedStatus })
            .eq('id', row.id)
            .eq('tenant_id', tenantId)
            .eq('invoice_id', invoiceId)
            .eq('status', 'queued');
          if (reconcileError) throw new Error(reconcileError.message);
        }
        return { skippedStateChanged: true as const };
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
