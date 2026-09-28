import type { SupabaseClient } from '@supabase/supabase-js';
import type { KsefEnvironment } from '@/types/ksef';

const CORRECTION_FA_TYPES = ['KOR', 'KOR_ZAL', 'KOR_ROZ'] as const;
export const CORRECTION_RECONCILIATION_MESSAGE =
  'Kwoty przyjętych korekt wymagają uzgodnienia przed pokazaniem raportu';

export class CorrectionReconciliationError extends Error {
  constructor() {
    super(CORRECTION_RECONCILIATION_MESSAGE);
    this.name = 'CorrectionReconciliationError';
  }
}

export function isUnreconciledCorrectionRow(row: {
  invoice_kind: string | null;
  invoice_type: string | null;
}): boolean {
  return row.invoice_kind === 'correction' ||
    CORRECTION_FA_TYPES.some((type) => row.invoice_type === type);
}

/**
 * An environment filter alone could silently omit historical production
 * invoices whose provenance is NULL. Block a legal read until the whole
 * requested period has a verified environment, then apply the filter.
 * The caller supplies either a tenant-scoped session client or a trusted
 * admin client with an explicit tenant filter.
 */
export async function assertAcceptedInvoiceEnvironmentComplete(
  client: SupabaseClient,
  params: {
    tenantId: string;
    periodStart: string;
    periodEnd: string;
    direction: 'outgoing' | 'incoming' | 'both';
    environment: KsefEnvironment;
  },
): Promise<void> {
  let query = client.from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', params.tenantId)
    .eq('ksef_status', 'accepted')
    .or(`ksef_environment.is.null,ksef_environment.neq.${params.environment}`)
    .gte('issue_date', params.periodStart)
    .lte('issue_date', params.periodEnd);
  if (params.direction !== 'both') query = query.eq('direction', params.direction);

  const { count, error } = await query;
  if (error || typeof count !== 'number') {
    throw new Error('KSeF environment reconciliation check is unavailable');
  }
  if (count > 0) {
    throw new Error('Accepted invoices require KSeF environment reconciliation');
  }
}

/**
 * Until correction amounts and imported KOR documents are reconciled against
 * their legal XML, no sales total may silently treat a full "after" amount as
 * another sale. Imports can store KOR with invoice_kind=regular, so both
 * classifications must be checked. A failed count is not proof of no KOR.
 */
export async function assertOutgoingCorrectionsReconciled(
  client: SupabaseClient,
  params: {
    tenantId: string;
    periodStart: string;
    environment: KsefEnvironment;
  } & (
    | { periodEnd: string; endBound: 'inclusive' | 'exclusive' }
    | { periodEnd?: never; endBound?: never }
  ),
): Promise<void> {
  let query = client.from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', params.tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .eq('ksef_environment', params.environment)
    .gte('issue_date', params.periodStart)
    .or(`invoice_kind.eq.correction,invoice_type.in.(${CORRECTION_FA_TYPES.join(',')})`);
  if (params.periodEnd !== undefined) {
    query = params.endBound === 'inclusive'
      ? query.lte('issue_date', params.periodEnd)
      : query.lt('issue_date', params.periodEnd);
  }

  const { count, error } = await query;

  if (error || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('Nie można sprawdzić kwot przyjętych korekt');
  }
  if (count > 0) {
    throw new CorrectionReconciliationError();
  }
}
