// Cron: codziennie o 4:00 (Europe/Warsaw) — kontrahenci bez walidacji od >7 dni + cleanup cache.

import { createAdminClient } from '@/lib/supabase/admin';
import { validateNipCached } from '@/lib/validation/cache';
import { contractorValidationPatch } from '@/lib/validation/contractor-update';

import type { JobContext } from '@/lib/jobs/registry';

const STALE_AFTER_MS = 7 * 86400_000;
const BATCH_SIZE = 10;

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-a.ts (kolejka cron.nightly-validation-recheck).
 */
export async function runNightlyValidationRecheck({ step, logger }: JobContext) {
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
    let failed = 0;

    for (let i = 0; i < contractors.length; i += BATCH_SIZE) {
      const batch = contractors.slice(i, i + BATCH_SIZE);

      const batchStats = await step.run(`validate-batch-${i}`, async () => {
        const supabase = createAdminClient();
        let bv = 0;
        let sc = 0;
        let bf = 0;

        for (const c of batch) {
          const nip =
            typeof c.nip === 'string' ? c.nip.trim().replace(/[\s-]/g, '') : '';

          if (!nip) continue;

          try {
            const result = await validateNipCached(nip, 'PL', {
              forceRefresh: true,
            });

            // API niedostępne (limit zapytań przy setkach kontrahentów, timeout):
            // zostawiamy ostatni dobry status i rachunki, następna noc spróbuje.
            const patch = contractorValidationPatch(result);
            if (!patch) continue;

            const prevStatus = c.vat_status;
            const statusChangedBatch = result.vatStatus !== prevStatus;

            const { error: updateError } = await supabase
              .from('contractors')
              .update(patch)
              .eq('id', c.id)
              .eq('tenant_id', c.tenant_id);
            // Nieudany zapis to nie „zwalidowany” — do 02.10 liczył się jako sukces.
            if (updateError) throw new Error(updateError.message);

            bv++;
            if (statusChangedBatch) sc++;
          } catch (e) {
            // Opuszczamy pojedynczego kontrahenta (następna noc spróbuje),
            // ale ze śladem — do 02.10 catch był pusty (AUD-89).
            bf++;
            logger.warn('Nocna re-walidacja: kontrahent pominięty', {
              contractorId: c.id,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        return { validated: bv, statusChanged: sc, failed: bf };
      });

      validated += batchStats.validated;
      statusChanged += batchStats.statusChanged;
      failed += batchStats.failed;

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
      failed,
    };
}

