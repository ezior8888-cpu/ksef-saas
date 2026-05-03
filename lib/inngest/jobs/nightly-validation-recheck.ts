// Cron: codziennie o 4:00 (Europe/Warsaw) — kontrahenci bez walidacji od >7 dni + cleanup cache.

import { cron } from 'inngest';

import { createAdminClient } from '@/lib/supabase/admin';
import { validateNipCached } from '@/lib/validation/cache';

import { inngest } from '../client';

const STALE_AFTER_MS = 7 * 86400_000;
const BATCH_SIZE = 10;

export const nightlyValidationRecheckJob = inngest.createFunction(
  {
    id: 'nightly-validation-recheck',
    name: 'Nocna re-walidacja kontrahentów (Biała Lista/VIES)',
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/Warsaw 0 4 * * *')],
  },
  async ({ step }) => {
    const cutoffIso = new Date(Date.now() - STALE_AFTER_MS).toISOString();

    const deletedRows = await step.run('cleanup-cache', async () => {
      const supabase = createAdminClient();

      const { data, error } =
        await supabase.rpc('cleanup_expired_validation_cache');

      if (error) throw new Error(error.message);
      return data ?? 0;
    });

    const contractors = await step.run('fetch-stale-contractors', async () => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from('contractors')
        .select('id, nip, tenant_id, vat_status')
        .not('nip', 'is', null)
        .or(`last_validation_at.is.null,last_validation_at.lt."${cutoffIso}"`)
        .order('last_validation_at', {
          ascending: true,
          nullsFirst: true,
        })
        .limit(500);

      if (error) throw new Error(error.message);
      return data ?? [];
    });

    let validated = 0;
    let statusChanged = 0;

    for (let i = 0; i < contractors.length; i += BATCH_SIZE) {
      const batch = contractors.slice(i, i + BATCH_SIZE);

      const batchStats = await step.run(`validate-batch-${i}`, async () => {
        const supabase = createAdminClient();
        let bv = 0;
        let sc = 0;

        for (const c of batch) {
          const nip =
            typeof c.nip === 'string' ? c.nip.trim().replace(/[\s-]/g, '') : '';

          if (!nip) continue;

          try {
            const result = await validateNipCached(nip, 'PL', {
              forceRefresh: true,
            });

            const prevStatus = c.vat_status;
            const statusChangedBatch = result.vatStatus !== prevStatus;

            await supabase
              .from('contractors')
              .update({
                vat_status: result.vatStatus,
                last_validation_at: new Date().toISOString(),
                last_validation_source: result.source,
                bank_accounts_validated: result.bankAccounts,
                validation_warning: result.warning ?? null,
              })
              .eq('id', c.id)
              .eq('tenant_id', c.tenant_id);

            bv++;
            if (statusChangedBatch) sc++;
          } catch {
            // opuszczamy pojedynczego kontrahenta
          }
        }

        return { validated: bv, statusChanged: sc };
      });

      validated += batchStats.validated;
      statusChanged += batchStats.statusChanged;

      if (i + BATCH_SIZE < contractors.length) {
        await step.sleep(`rate-limit-nightly-batch-${i}`, '2s');
      }
    }

    return {
      success: true,
      cacheCleanupDeleted: deletedRows,
      processed: contractors.length,
      validated,
      statusChanged,
    };
  },
);
