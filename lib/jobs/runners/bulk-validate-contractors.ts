// Bulk validation kontrahentów — na żądanie użytkownika (event z UI).

import { createAdminClient } from '@/lib/supabase/admin';
import { validateNipCached } from '@/lib/validation/cache';
import { contractorValidationPatch } from '@/lib/validation/contractor-update';

import { validationBulkContractorsRequested } from '../events';
import { maskNip } from '@/lib/jobs/logger';
import type { JobContext } from '@/lib/jobs/registry';

/** Ile identyfikatorów w jednym zapytaniu `.in()`. */
const FETCH_CHUNK = 100;

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-c.ts
 */
export async function runBulkValidateContractors(data: Parameters<typeof validationBulkContractorsRequested.create>[0], { step }: JobContext) {
    const { tenantId, contractorIds, forceRefresh } = data;

    // Paczkami: `.in()` idzie w adresie URL (ok. 39 znaków na UUID), więc
    // jedno zapytanie ze wszystkimi kontrahentami przy kilkuset pozycjach
    // przekraczało limit długości adresu i job padał przed pierwszym
    // sprawdzeniem (F-088).
    const contractors = await step.run('fetch-contractors', async () => {
      const supabase = createAdminClient();
      const rows: Array<{ id: string; nip: string | null }> = [];

      for (let i = 0; i < contractorIds.length; i += FETCH_CHUNK) {
        const { data, error } = await supabase
          .from('contractors')
          .select('id, nip')
          .eq('tenant_id', tenantId)
          .in('id', contractorIds.slice(i, i + FETCH_CHUNK));

        if (error) {
          throw new Error(error.message);
        }
        rows.push(...(data ?? []));
      }

      return rows;
    });

    let validated = 0;
    let active = 0;
    let inactive = 0;
    let withWarnings = 0;

    const batchSize = 5;
    for (let i = 0; i < contractors.length; i += batchSize) {
      const batch = contractors.slice(i, i + batchSize);

      const batchStats = await step.run(`validate-batch-${i}`, async () => {
        const supabase = createAdminClient();
        let bv = 0;
        let ba = 0;
        let bin = 0;
        let bw = 0;

        for (const c of batch) {
          const nip =
            typeof c.nip === 'string' ? c.nip.trim().replace(/[\s-]/g, '') : '';

          if (!nip) continue;

          try {
            const result = await validateNipCached(nip, 'PL', {
              forceRefresh,
            });

            // API niedostępne: status i rachunki kontrahenta zostają bez zmian.
            const patch = contractorValidationPatch(result);
            if (!patch) continue;

            const { error: updateError } = await supabase
              .from('contractors')
              .update(patch)
              .eq('id', c.id)
              .eq('tenant_id', tenantId);
            if (updateError) {
              console.error(`Bulk validate: zapis nieudany (${maskNip(nip)})`, updateError.message);
              continue;
            }

            bv++;
            if (result.vatStatus === 'active') ba++;
            if (result.vatStatus === 'inactive') bin++;
            if (result.warning) bw++;
          } catch (e) {
            console.error(`Bulk validate failed (${maskNip(nip)})`, e);
          }
        }

        return {
          validated: bv,
          active: ba,
          inactive: bin,
          withWarnings: bw,
        };
      });

      validated += batchStats.validated;
      active += batchStats.active;
      inactive += batchStats.inactive;
      withWarnings += batchStats.withWarnings;

      if (i + batchSize < contractors.length) {
        await step.sleep(`rate-limit-batch-${i}`, '1s');
      }
    }

    return {
      success: true,
      validated,
      active,
      inactive,
      withWarnings,
    };
}

