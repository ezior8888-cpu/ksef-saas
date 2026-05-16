// Cron job: wykonuje GDPR delete dla requestów, których cooling-off
// minął (scheduled_for <= now()).
//
// Faza 28 Krok 7. Razem z 14-dniowym cooling-off (lib/gdpr/deletion.ts)
// stanowi pełen flow RODO art. 17. Cron co godzinę żeby user dostawał
// delete tego samego dnia gdy cooling-off się skończy (zamiast czekać
// do końca dnia).
//
// Concurrency: limit 1 — kolejne pending requesty obrabiamy sekwencyjnie,
// żeby nie zajeżdżać auth.admin.deleteUser() rate-limitów Supabase.

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { inngest } from '@/lib/inngest/client';
import {
  executeGdprRequest,
  findDueGdprRequests,
} from '@/lib/gdpr/deletion';

export const gdprProcessDeletionsJob = inngest.createFunction(
  {
    id: 'gdpr-process-deletions',
    name: 'GDPR: wykonaj pending requests z minionym cooling-off',
    concurrency: { limit: 1 },
    // Co godzinę.
    triggers: [cron('0 * * * *')],
  },
  async ({ step }) => {
    const due = await step.run('find-due', async () => {
      return await findDueGdprRequests();
    });

    if (due.length === 0) {
      return { processed: 0 };
    }

    let success = 0;
    let failed = 0;
    for (const req of due) {
      const result = await step.run(`execute-${req.id}`, async () => {
        try {
          return await executeGdprRequest(req.id);
        } catch (err) {
          Sentry.captureException(err, {
            tags: { job: 'gdpr-process-deletions', request_id: req.id },
          });
          return { ok: false, error: 'exception' };
        }
      });

      if (result.ok) success++;
      else {
        failed++;
        Sentry.captureMessage(
          `GDPR execute failed: ${result.error ?? 'unknown'}`,
          {
            level: 'error',
            tags: { request_id: req.id },
          },
        );
      }
    }

    return { processed: due.length, success, failed };
  },
);
