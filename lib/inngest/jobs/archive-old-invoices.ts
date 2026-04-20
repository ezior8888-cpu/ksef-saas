import { cron } from 'inngest';

import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Cron codziennie o 3:00 PL — faktury starsze niż ~2 lata od daty wystawienia,
 * z zapisanym XML w R2, oznaczamy jako zarchiwizowane (`archived_at`).
 *
 * Fizyczne przeniesienie do S3 Glacier — Faza 8 (wtedy `archive_storage_path`).
 */
export const archiveOldInvoicesJob = inngest.createFunction(
  {
    id: 'archive-old-invoices-cron',
    name: 'Archiwizacja faktur starszych niż 2 lata',
    triggers: [cron('TZ=Europe/Warsaw 0 3 * * *')],
  },
  async ({ step, logger }) => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const issueBefore = twoYearsAgo.toISOString().slice(0, 10);

    const candidates = await step.run('find-candidates', async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('invoices')
        .select('id, tenant_id, issue_date, xml_storage_path')
        .lt('issue_date', issueBefore)
        .is('archived_at', null)
        .not('xml_storage_path', 'is', null)
        .limit(500);

      if (error) throw new Error(`Find candidates failed: ${error.message}`);
      return data ?? [];
    });

    logger.info(`Znaleziono ${candidates.length} faktur do archiwizacji`);

    if (candidates.length === 0) return { archived: 0 };

    const ids = candidates.map((c) => c.id);

    await step.run('mark-archived', async () => {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('invoices')
        .update({
          archived_at: new Date().toISOString(),
        })
        .in('id', ids);

      if (error) throw new Error(`Mark archived failed: ${error.message}`);
    });

    await step.run('schedule-deletion', async () => {
      const supabase = createAdminClient();
      const deletionDate = new Date();
      deletionDate.setFullYear(deletionDate.getFullYear() + 8);

      const { error } = await supabase
        .from('invoices')
        .update({ scheduled_deletion_at: deletionDate.toISOString() })
        .in('id', ids);

      if (error) throw new Error(`Schedule deletion failed: ${error.message}`);
    });

    return { archived: candidates.length };
  }
);
