// Cron job: usuwa audit_logs starsze niż 12 miesięcy + inngest_run_log > 3mc.
//
// Faza 21 (sekcja 21.3) — bez tego audit_logs rosną w nieskończoność,
// w prior projektach widzieliśmy >5GB po roku produkcji. RODO retention dla
// faktur to 10 lat (tenants.retention_years), ale audit_logs to nie dane
// podatkowe, więc 12mc jest legalnie OK.
//
// Trigger: 1. dnia miesiąca o 03:00 PL — godzina low-traffic, miesięczna
// kadencja żeby nie hammer-ować DELETE każdego dnia.
//
// Concurrency: limit 1. Jeśli poprzedni run się zawiesi, nie chcemy
// równoległego DELETE w tabeli z hot-path INSERT-ami z aplikacji.

import { cron } from 'inngest';
import * as Sentry from '@sentry/nextjs';

import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_RETENTION_MONTHS = 12;

interface CleanupResult {
  deleted_audit_logs: number;
  cutoff: string;
  duration_ms: number;
}

export const cleanupAuditLogsJob = inngest.createFunction(
  {
    id: 'cleanup-audit-logs',
    name: 'DB: cleanup audit_logs starsze niż 12 miesięcy',
    concurrency: { limit: 1 },
    // 1. dnia miesiąca o 03:00 PL.
    triggers: [cron('TZ=Europe/Warsaw 0 3 1 * *')],
  },
  async ({ step }) => {
    const supabase = createAdminClient();

    const result = await step.run('cleanup', async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: { p_retention_months: number },
      ) => Promise<{ data: CleanupResult | null; error: { message: string } | null }>)('cleanup_old_audit_logs', {
        p_retention_months: DEFAULT_RETENTION_MONTHS,
      });

      if (error) {
        throw new Error(`cleanup_old_audit_logs failed: ${error.message}`);
      }
      return data;
    });

    Sentry.addBreadcrumb({
      category: 'db.cleanup',
      level: 'info',
      message: 'audit_logs cleanup completed',
      data: result ?? undefined,
    });

    // Sygnał gdy retention DELETE trwa > 30s — może warto pomyśleć o
    // partycjonowaniu lub batch-delete dla większych runów.
    if ((result?.duration_ms ?? 0) > 30_000) {
      Sentry.captureMessage('audit_logs cleanup > 30s', {
        level: 'warning',
        extra: { ...result },
      });
    }

    return result ?? { skipped: true as const };
  },
);
