/**
 * Inngest: cykliczna próba wysłania faktur z kolejki Trybu Offline24.
 */

import { cron } from 'inngest';

import { createAdminClient } from '@/lib/supabase/server';
import { checkKsefAvailability } from '@/lib/ksef/health-check';
import { calculateNextRetry } from '@/lib/ksef/idempotency';
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

export const processOfflineQueueJob = inngest.createFunction(
  {
    id: 'process-offline-queue',
    name: 'Procesowanie kolejki Offline24',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw */5 * * * *')],
  },
  async ({ step }) => {
    const health = await step.run('check-ksef-health', () =>
      checkKsefAvailability(),
    );

    if (!health.available) {
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
      const deadlinePassed = await step.run(
        `deadline-check-${item.id}`,
        () => new Date(item.deadline).getTime() < Date.now(),
      );

      if (deadlinePassed) {
        await step.run(`expire-offline-queue-${item.id}`, async () => {
          const supabase = createAdminClient();
          const { error } = await supabase
            .from('ksef_offline_queue')
            .update({ status: 'expired', last_error: 'OFFLINE_DEADLINE_EXCEEDED' })
            .eq('id', item.id);
          if (error) throw new Error(error.message);

          await updateInvoiceStatus(item.invoice_id, {
            ksef_status: 'failed',
            last_error: 'Przekroczono deadline Offline24',
            last_error_code: 'OFFLINE_DEADLINE_EXCEEDED',
            last_error_field: null,
            last_error_suggestion: null,
          });
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

          const invoice = await getInvoiceForSubmit(item.invoice_id);

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

          const { error } = await supabase
            .from('ksef_offline_queue')
            .update({
              status: 'sending',
              attempts,
              last_attempt_at: new Date().toISOString(),
              next_attempt_at: calculateNextRetry(attempts).toISOString(),
            })
            .eq('id', item.id);
          if (error) throw new Error(error.message);
        });

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
  },
);

export const offlineQueueSuccessHandler = inngest.createFunction(
  {
    id: 'offline-queue-success-handler',
    name: 'Offline24: oznaczenie wysłanych po sukcesie',
    concurrency: { limit: 25 },
    triggers: [invoiceSubmitSucceeded],
  },
  async ({ event, step }) => {
    if (!event.data.fromOfflineQueue) {
      return { skipped: true as const, reason: 'not-from-offline' };
    }

    const invoiceId = event.data.invoiceId;

    await step.run('mark-queue-sent', async () => {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('ksef_offline_queue')
        .update({ status: 'sent', last_error: null })
        .eq('invoice_id', invoiceId)
        .eq('status', 'sending');
      if (error) throw new Error(error.message);
    });

    return { success: true as const };
  },
);

export const offlineQueueFailureHandler = inngest.createFunction(
  {
    id: 'offline-queue-failure-handler',
    name: 'Offline24: przywrócenie kolejki po błędzie submit',
    concurrency: { limit: 25 },
    triggers: [invoiceSubmitFailed],
  },
  async ({ event, step }) => {
    if (!event.data.fromOfflineQueue) {
      return { skipped: true as const, reason: 'not-from-offline' };
    }

    const { invoiceId, error: errorMessage } = event.data;

    await step.run('rollback-queue-status', async () => {
      const supabase = createAdminClient();

      const { data: row, error: selErr } = await supabase
        .from('ksef_offline_queue')
        .select('id, attempts, status')
        .eq('invoice_id', invoiceId)
        .eq('status', 'sending')
        .maybeSingle();
      if (selErr) throw new Error(selErr.message);
      if (!row?.id) {
        return { skippedNoRow: true as const };
      }

      const attempts = row.attempts ?? 1;

      const { error: updQ } = await supabase
        .from('ksef_offline_queue')
        .update({
          status: 'queued',
          last_error:
            errorMessage.length > 2000
              ? `${errorMessage.slice(0, 1997)}...`
              : errorMessage,
          next_attempt_at: calculateNextRetry(attempts).toISOString(),
        })
        .eq('id', row.id);
      if (updQ) throw new Error(updQ.message);

      await updateInvoiceStatus(invoiceId, {
        ksef_status: 'offline_queued',
        last_error:
          errorMessage.length > 5000
            ? `${errorMessage.slice(0, 4997)}...`
            : errorMessage,
        last_error_code: 'OFFLINE_SUBMIT_RETRY',
        last_error_field: null,
        last_error_suggestion: null,
      });
    });

    return { success: true as const };
  },
);
