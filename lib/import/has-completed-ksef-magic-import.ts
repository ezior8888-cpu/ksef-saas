import { cache } from 'react';

import { createAdminClient } from '@/lib/supabase/server';

/**
 * Czy dla tenanta zakończono co najmniej jeden job Magicznego Importu z KSeF
 * (`source = ksef_history`, `status = completed`).
 */
export const getHasCompletedKsefMagicImport = cache(
  async (tenantId: string): Promise<boolean> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('import_jobs')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('source', 'ksef_history')
      .eq('status', 'completed')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[import] hasCompletedKsefMagicImport', error.message);
      return false;
    }

    return data !== null;
  },
);
