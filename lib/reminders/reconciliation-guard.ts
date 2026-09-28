import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ReminderConsentDenied } from './delivery-errors';

/** An original with any linked child may have a different legal balance. */
export async function assertNoRelatedInvoice(
  client: ReturnType<typeof createAdminClient>, tenantId: string, invoiceId: string,
): Promise<void> {
  // HEAD with an exact count has no response page to truncate. Do not filter by
  // child kind/status: a draft, rejected, or malformed child needs reconciliation.
  const { count, error } = await client.from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('parent_invoice_id', invoiceId);
  if (error || count === null || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('Nie można potwierdzić braku korekt faktury.');
  }
  if (count !== 0) {
    throw new ReminderConsentDenied('Faktura ma dokument powiązany. Uzgodnij saldo przed przypomnieniem.');
  }
}
