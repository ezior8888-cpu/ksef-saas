// Bulk validation kontrahentów — na żądanie użytkownika (event z UI).

import { createAdminClient } from '@/lib/supabase/admin';
import { validateNipCached } from '@/lib/validation/cache';

import { inngest, validationBulkContractorsRequested } from '../client';

export const bulkValidateContractorsJob = inngest.createFunction(
  {
    id: 'bulk-validate-contractors',
    name: 'Bulk weryfikacja kontrahentów (Biała Lista/VIES)',
    retries: 1,
    concurrency: { limit: 3 },
    triggers: [validationBulkContractorsRequested],
  },
  async ({ event, step }) => {
    const { tenantId, contractorIds, forceRefresh } = event.data;

    const contractors = await step.run('fetch-contractors', async () => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from('contractors')
        .select('id, nip')
        .eq('tenant_id', tenantId)
        .in('id', contractorIds);

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
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
              .eq('tenant_id', tenantId);

            bv++;
            if (result.vatStatus === 'active') ba++;
            if (result.vatStatus === 'inactive') bin++;
            if (result.warning) bw++;
          } catch (e) {
            console.error(`Bulk validate failed (${nip})`, e);
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
  },
);
