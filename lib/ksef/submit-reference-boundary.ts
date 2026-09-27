import { NonRetriableError } from 'inngest';
import { isDeepStrictEqual } from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { KsefEnvironment } from '@/types/ksef';
import type { Invoice } from '@/types/invoice';
import type { AdvanceInvoiceData, CorrectionInvoiceData, FinalInvoiceData } from '@/types/invoice-types';

interface SubmitReferenceInput {
  supabase: SupabaseClient;
  tenantId: string;
  invoiceId: string;
  invoice: Invoice;
  environment: KsefEnvironment;
  correctionData?: CorrectionInvoiceData;
  advanceData?: AdvanceInvoiceData;
  finalData?: FinalInvoiceData;
  finalAdvanceSettlementRows?: readonly unknown[];
}

function invalidPayload(): never {
  throw new NonRetriableError('KSeF document kind or source requires manual reconciliation');
}

/** Re-read the stored legal document before KSeF I/O; old/replayed events are not authority. */
export async function assertSubmitReferences(
  input: SubmitReferenceInput,
): Promise<'regular' | 'correction' | 'advance' | 'final'> {
  const { data: invoice, error } = await input.supabase
    .from('invoices')
    .select('id, invoice_kind, invoice_type, internal_number, parent_invoice_id, advance_invoice_ids, fa3_data')
    .eq('id', input.invoiceId)
    .eq('tenant_id', input.tenantId)
    .maybeSingle();
  if (error) throw new Error('Cannot read KSeF invoice kind');
  if (!invoice?.id) invalidPayload();

  // Enqueue publishes before the status becomes queued. A tenant could change
  // fa3_data in that interval; never send a stale event's legal document.
  let eventDocument: unknown;
  try {
    eventDocument = JSON.parse(JSON.stringify(input.invoice));
  } catch {
    invalidPayload();
  }
  if (!invoice.fa3_data || !isDeepStrictEqual(invoice.fa3_data, eventDocument) ||
      invoice.invoice_type !== input.invoice.type ||
      invoice.internal_number !== input.invoice.internalNumber) invalidPayload();

  const { correctionData, advanceData, finalData } = input;
  switch (invoice.invoice_kind) {
    case 'regular':
      if (correctionData || advanceData || finalData) invalidPayload();
      return 'regular';
    case 'correction': {
      if (input.environment === 'production') invalidPayload();
      if (!correctionData || advanceData || finalData ||
          correctionData.invoiceType !== 'correction' ||
          typeof correctionData.seller?.nip !== 'string' ||
          invoice.parent_invoice_id !== correctionData.parentInvoiceId ||
          invoice.internal_number !== correctionData.internalNumber) invalidPayload();

      const { data: parent, error: parentError } = await input.supabase
        .from('invoices')
        .select('id, internal_number, issue_date, ksef_number, seller_nip')
        .eq('id', correctionData.parentInvoiceId)
        .eq('tenant_id', input.tenantId)
        .eq('direction', 'outgoing')
        .eq('invoice_kind', 'regular')
        .eq('ksef_status', 'accepted')
        .eq('ksef_environment', input.environment)
        .maybeSingle();
      if (parentError) throw new Error('Cannot read KSeF correction parent');
      if (!parent?.id || !parent.ksef_number?.trim() ||
          parent.internal_number !== correctionData.parentInvoiceNumber ||
          parent.issue_date !== correctionData.parentInvoiceIssueDate ||
          parent.ksef_number !== correctionData.parentKsefNumber ||
          !parent.seller_nip ||
          parent.seller_nip.replace(/\s+/g, '') !== correctionData.seller.nip.replace(/\s+/g, '')) {
        invalidPayload();
      }
      return 'correction';
    }
    case 'advance':
      if (!advanceData || correctionData || finalData ||
          advanceData.invoiceType !== 'advance' ||
          invoice.internal_number !== advanceData.internalNumber) invalidPayload();
      return 'advance';
    case 'final': {
      // Settlement rows are event-supplied and advances are not atomically
      // claimed yet. Never emit legal ROZ XML in production on that evidence.
      if (input.environment === 'production') invalidPayload();
      if (!finalData || correctionData || advanceData ||
          finalData.invoiceType !== 'final' ||
          invoice.internal_number !== finalData.internalNumber ||
          !Array.isArray(finalData.advanceInvoiceIds) ||
          !Array.isArray(input.finalAdvanceSettlementRows) ||
          !input.finalAdvanceSettlementRows.length) invalidPayload();
      const storedIds = invoice.advance_invoice_ids as string[] | null;
      if (!Array.isArray(storedIds) || storedIds.length !== finalData.advanceInvoiceIds.length ||
          storedIds.some((id, index) => id !== finalData.advanceInvoiceIds[index])) invalidPayload();
      return 'final';
    }
    default:
      invalidPayload();
  }
}
