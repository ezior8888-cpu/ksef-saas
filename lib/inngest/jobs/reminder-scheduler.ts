// Cron: co godzinę szuka faktur wymagających przypomnień i scheduling-uje wysyłki

import { cron } from 'inngest';

import { inngest, remindersSendRequested } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  decideNextReminder,
  findInvoicesRequiringReminders,
} from '@/lib/reminders/scheduler';

export const reminderSchedulerJob = inngest.createFunction(
  {
    id: 'reminder-scheduler',
    name: 'Wkurzacz: scheduler (co godzinę)',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw 0 * * * *')],
  },
  async ({ step }) => {
    const supabase = createAdminClient();

    const candidates = await step.run('find-candidates', async () => {
      return findInvoicesRequiringReminders();
    });

    if (candidates.length === 0) {
      return { processed: 0, scheduled: 0, message: 'Brak kandydatów' };
    }

    let scheduledCount = 0;
    const errors: Array<{ invoiceId: string; error: string }> = [];

    for (const invoice of candidates) {
      try {
        const decision = await step.run(`decide-${invoice.id}`, async () => {
          return decideNextReminder(invoice);
        });

        if (!decision.shouldSend || !decision.stage || !decision.scheduledFor) {
          continue;
        }

        const scheduledAt = coerceStepDate(decision.scheduledFor);
        if (Number.isNaN(scheduledAt.getTime())) {
          errors.push({
            invoiceId: invoice.id,
            error: 'scheduledFor niepoprawny po serializacji kroku',
          });
          continue;
        }

        const reminderId = await step.run(
          `create-reminder-${invoice.id}`,
          async () => {
            const { data, error } = await supabase
              .from('payment_reminders')
              .insert({
                tenant_id: invoice.tenant_id,
                invoice_id: invoice.id,
                stage: decision.stage,
                channel: 'email',
                scheduled_for: scheduledAt.toISOString(),
                status: 'pending',
              })
              .select('id')
              .single();

            if (error?.code === '23505') {
              return null;
            }

            if (error) throw error;
            return data?.id;
          },
        );

        if (!reminderId) continue;

        await step.sendEvent(
          `schedule-send-${reminderId}`,
          remindersSendRequested.create(
            { reminderId },
            { ts: scheduledAt.getTime() },
          ),
        );

        scheduledCount++;
      } catch (e) {
        errors.push({
          invoiceId: invoice.id,
          error: e instanceof Error ? e.message : 'Unknown',
        });
      }
    }

    return {
      processed: candidates.length,
      scheduled: scheduledCount,
      errors: errors.length,
    };
  },
);

function coerceStepDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(NaN);
}
