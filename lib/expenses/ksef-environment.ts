import type { SupabaseClient } from '@supabase/supabase-js';
import type { KsefEnvironment } from '@/types/ksef';

type LinkedExpense = {
  source: unknown;
  ksef_invoice_id: unknown;
};

const LINK_PAGE_SIZE = 100;

/** Keep ordinary costs, but require a proven incoming KSeF invoice for linked costs. */
export async function filterExpensesForKsefEnvironment<T extends LinkedExpense>(
  client: SupabaseClient,
  tenantId: string,
  environment: KsefEnvironment,
  expenses: readonly T[],
): Promise<T[]> {
  const links = expenses.map((expense) => {
    const { source, ksef_invoice_id: invoiceId } = expense;
    if (source !== 'manual' && source !== 'ocr_photo' &&
        source !== 'import' && source !== 'ksef_inbox') {
      throw new Error('Expense KSeF provenance is malformed');
    }
    if (invoiceId !== null && (typeof invoiceId !== 'string' || !invoiceId)) {
      throw new Error('Expense KSeF provenance is malformed');
    }
    if (source === 'ksef_inbox' && !invoiceId) {
      throw new Error('KSeF expense has no linked invoice for environment reconciliation');
    }
    return { expense, invoiceId };
  });
  const ids = [...new Set(links.flatMap(({ invoiceId }) => invoiceId ? [invoiceId] : []))];

  const invoiceEnvironment = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += LINK_PAGE_SIZE) {
    const batch = ids.slice(offset, offset + LINK_PAGE_SIZE);
    const { data, error } = await client.from('invoices')
      .select('id, tenant_id, direction, ksef_status, ksef_environment')
      .eq('tenant_id', tenantId)
      .in('id', batch);
    if (error || !data) {
      throw new Error('KSeF expense invoice provenance check is unavailable');
    }
    for (const invoice of data) {
      if (invoice.direction !== 'incoming' || invoice.ksef_status !== 'accepted' ||
          (invoice.ksef_environment !== 'test' &&
            invoice.ksef_environment !== 'demo' &&
            invoice.ksef_environment !== 'production')) {
        throw new Error('KSeF expense invoice requires environment reconciliation');
      }
      invoiceEnvironment.set(invoice.id, invoice.ksef_environment);
    }
    if (batch.some((id) => !invoiceEnvironment.has(id))) {
      throw new Error('KSeF expense invoice is missing from this organization');
    }
  }

  return links.filter(({ invoiceId }) =>
    !invoiceId || invoiceEnvironment.get(invoiceId) === environment,
  ).map(({ expense }) => expense);
}
