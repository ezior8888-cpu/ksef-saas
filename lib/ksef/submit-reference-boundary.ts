import { NonRetriableError } from 'inngest';
import { isDeepStrictEqual } from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { KsefEnvironment } from '@/types/ksef';
import type { Invoice } from '@/types/invoice';
import type { AdvanceInvoiceData, CorrectionInvoiceData, FinalInvoiceData, SellerData } from '@/types/invoice-types';
import { sellerPartyFromSellerData } from '@/lib/invoices/map-buyer-party';
import { matchesTenantSeller, sellerFromTenantProfile } from '@/lib/invoices/tenant-seller';

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

function plainJson(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    invalidPayload();
  }
}

function frozenBankAccount(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') invalidPayload();
  return value.replace(/\s+/g, '') || undefined;
}

/** A special XML uses its separate envelope, so it must have the frozen seller. */
async function assertSpecialSeller(
  input: SubmitReferenceInput,
  stored: { seller_nip?: unknown; seller_data?: unknown },
  envelopeSeller: SellerData,
): Promise<void> {
  if (!envelopeSeller || typeof envelopeSeller.nip !== 'string' ||
      typeof envelopeSeller.name !== 'string' ||
      typeof envelopeSeller.address?.countryCode !== 'string' ||
      typeof envelopeSeller.address.addressLine1 !== 'string' ||
      typeof envelopeSeller.address.addressLine2 !== 'string') invalidPayload();

  const sellerFromEnvelope = plainJson(sellerPartyFromSellerData(envelopeSeller));
  const sellerFromEvent = plainJson(input.invoice.seller);
  if (!isDeepStrictEqual(sellerFromEnvelope, sellerFromEvent) ||
      !isDeepStrictEqual(stored.seller_data, sellerFromEvent) ||
      typeof stored.seller_nip !== 'string' ||
      stored.seller_nip.replace(/\D/g, '') !== envelopeSeller.nip.replace(/\D/g, '')) invalidPayload();

  // An older queued event could predate the Server Action seller guard.
  const { data: tenant, error } = await input.supabase
    .from('tenants')
    .select('nip, name, address_json')
    .eq('id', input.tenantId)
    .maybeSingle();
  if (error) throw new Error('Cannot read KSeF seller tenant');
  if (!tenant) invalidPayload();
  const tenantSeller = sellerFromTenantProfile(tenant);
  if (!tenantSeller || !matchesTenantSeller(envelopeSeller, tenantSeller)) invalidPayload();
}

/** Re-read the stored legal document before KSeF I/O; old/replayed events are not authority. */
export async function assertSubmitReferences(
  input: SubmitReferenceInput,
): Promise<'regular' | 'correction' | 'advance' | 'final'> {
  const { data: invoice, error } = await input.supabase
    .from('invoices')
    .select('id, invoice_kind, invoice_type, internal_number, parent_invoice_id, advance_invoice_ids, seller_nip, seller_data, fa3_data')
    .eq('id', input.invoiceId)
    .eq('tenant_id', input.tenantId)
    .eq('direction', 'outgoing')
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
      if (!input.invoice.advanceEnvelope ||
          !isDeepStrictEqual(plainJson(input.invoice.advanceEnvelope), plainJson(advanceData)) ||
          !advanceData.taxAnnotations ||
          (advanceData.taxAnnotations.cashMethod !== 1 && advanceData.taxAnnotations.cashMethod !== 2) ||
          (advanceData.taxAnnotations.splitPayment !== 1 && advanceData.taxAnnotations.splitPayment !== 2) ||
          input.invoice.annotations?.cashMethod !== advanceData.taxAnnotations.cashMethod ||
          input.invoice.annotations?.splitPayment !== advanceData.taxAnnotations.splitPayment ||
          (advanceData.taxAnnotations.splitPayment === 1 &&
            (advanceData.paymentMethod !== 'transfer' ||
              typeof advanceData.bankAccount !== 'string' || !advanceData.bankAccount.trim())) ||
          input.invoice.payment?.dueDate !== advanceData.paymentDueDate ||
          input.invoice.payment?.method !==
            (advanceData.paymentMethod === 'compensation' ? 'other' : advanceData.paymentMethod) ||
          frozenBankAccount(input.invoice.payment?.bankAccount) !==
            frozenBankAccount(advanceData.bankAccount)) {
        invalidPayload();
      }
      await assertSpecialSeller(input, invoice, advanceData.seller);
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
      // AUD-23: P_16/P_18A ROZ tylko z dokumentu zapisanego przy wystawieniu.
      const flags = finalData.taxAnnotations;
      if (!flags ||
          (flags.cashMethod !== 1 && flags.cashMethod !== 2) ||
          (flags.splitPayment !== 1 && flags.splitPayment !== 2) ||
          input.invoice.annotations?.cashMethod !== flags.cashMethod ||
          input.invoice.annotations?.splitPayment !== flags.splitPayment ||
          (flags.splitPayment === 1 &&
            (finalData.paymentMethod !== 'transfer' ||
              typeof finalData.bankAccount !== 'string' || !finalData.bankAccount.trim()))) {
        invalidPayload();
      }
      const storedIds = invoice.advance_invoice_ids as string[] | null;
      if (!Array.isArray(storedIds) || storedIds.length !== finalData.advanceInvoiceIds.length ||
          storedIds.some((id, index) => id !== finalData.advanceInvoiceIds[index])) invalidPayload();
      await assertSpecialSeller(input, invoice, finalData.seller);
      return 'final';
    }
    default:
      invalidPayload();
  }
}
