import { cron } from 'inngest';

import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/server';
import { logAuditSystem } from '@/lib/audit/log-system';

/**
 * Cron codziennie o 4:00 PL — usuwa faktury, których `scheduled_deletion_at`
 * już minął (polityka retencji, np. 10 lat od momentu zaplanowania usunięcia).
 *
 * HARD DELETE — `invoice_line_items`, `ksef_submissions`, `xml_documents`
 * kasują się kaskadowo (FK ON DELETE CASCADE w schemacie).
 */
export const retentionDeleteJob = inngest.createFunction(
  {
    id: 'retention-delete-cron',
    name: 'Usuwanie faktur po retencji',
    triggers: [cron('TZ=Europe/Warsaw 0 4 * * *')],
  },
  async ({ step, logger }) => {
    const nowIso = new Date().toISOString();

    const candidates = await step.run('find-candidates', async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('invoices')
        .select('id, tenant_id, internal_number')
        .not('scheduled_deletion_at', 'is', null)
        .lt('scheduled_deletion_at', nowIso)
        .limit(100);

      if (error) throw new Error(`Find candidates failed: ${error.message}`);
      return data ?? [];
    });

    if (candidates.length === 0) return { deleted: 0 };

    logger.info(`Usuwam ${candidates.length} faktur (retencja)`);

    await step.run('log-retention-deletions', async () => {
      for (const invoice of candidates) {
        await logAuditSystem({
          action: 'retention.deletion_executed',
          tenantId: invoice.tenant_id,
          entityType: 'invoice',
          entityId: invoice.id,
          metadata: {
            internalNumber: invoice.internal_number,
            reason: '10-year retention expired',
          },
        });
      }
    });

    await step.run('delete-invoices', async () => {
      const supabase = createAdminClient();
      const ids = candidates.map((c) => c.id);
      const { error } = await supabase.from('invoices').delete().in('id', ids);
      if (error) throw new Error(`Delete invoices failed: ${error.message}`);
    });

    return { deleted: candidates.length };
  }
);
