import { NonRetriableError } from 'inngest';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertJobIdentity } from './tenant-boundary';

export const UPO_IDENTITY_MISMATCH = 'UPO_IDENTITY_MISMATCH';

export interface UpoIdentity {
  invoiceId: string;
  tenantId: string;
  ksefNumber: string;
}

export class UpoIdentityMismatchError extends NonRetriableError {
  constructor() { super('UPO nie odpowiada zaakceptowanej fakturze organizacji'); }
}

export function assertUpoIdentity(identity: UpoIdentity): void {
  assertJobIdentity(identity.invoiceId, identity.tenantId);
  if (typeof identity.ksefNumber !== 'string' || !identity.ksefNumber.trim() || identity.ksefNumber.length > 200) {
    throw new UpoIdentityMismatchError();
  }
}

type InvoiceIdentity = { id: string; tenant_id: string; ksef_number: string | null; ksef_status: string | null };
export function matchesUpoInvoice(invoice: InvoiceIdentity | null, identity: UpoIdentity): boolean {
  return !!invoice && invoice.id === identity.invoiceId && invoice.tenant_id === identity.tenantId &&
    invoice.ksef_number === identity.ksefNumber && invoice.ksef_status === 'accepted';
}

/** Fresh, deliberately outside durable step caches whenever the caller is resumed. */
export async function requireAcceptedUpoInvoice(identity: UpoIdentity) {
  assertUpoIdentity(identity);
  const { data, error } = await createAdminClient().from('invoices')
    .select('id, tenant_id, ksef_number, ksef_status, internal_number, issue_date, gross_total, buyer_data, buyer_nip, seller_nip, tenants(id, name, nip)')
    .eq('id', identity.invoiceId).eq('tenant_id', identity.tenantId)
    .eq('ksef_number', identity.ksefNumber).eq('ksef_status', 'accepted').maybeSingle();
  if (error) throw new Error('Nie można sprawdzić faktury UPO');
  if (!data || !matchesUpoInvoice(data, identity)) throw new UpoIdentityMismatchError();
  const tenant = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants;
  if (tenant && tenant.id !== identity.tenantId) throw new UpoIdentityMismatchError();
  return data;
}

export type UpoReceiptIdentity = { id: string; tenant_id: string; invoice_id: string; ksef_number: string };
export function assertUpoReceipt(row: UpoReceiptIdentity, identity: UpoIdentity, receiptId?: string): void {
  assertJobIdentity(row.id, row.tenant_id);
  if ((receiptId !== undefined && row.id !== receiptId) || row.tenant_id !== identity.tenantId ||
      row.invoice_id !== identity.invoiceId || row.ksef_number !== identity.ksefNumber) {
    throw new UpoIdentityMismatchError();
  }
}

export async function readUpoReceipt(identity: UpoIdentity, receiptId?: string) {
  let query = createAdminClient().from('upo_receipts')
    .select('id, tenant_id, invoice_id, ksef_number, status, download_attempts')
    .eq('tenant_id', identity.tenantId).eq('invoice_id', identity.invoiceId);
  if (receiptId !== undefined) query = query.eq('id', receiptId).eq('ksef_number', identity.ksefNumber);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error('Nie można sprawdzić rekordu UPO');
  if (data) assertUpoReceipt(data, identity, receiptId);
  if (receiptId !== undefined && !data) throw new UpoIdentityMismatchError();
  return data;
}

export async function requireUpoBoundary(identity: UpoIdentity, receiptId: string) {
  const invoice = await requireAcceptedUpoInvoice(identity);
  const receipt = await readUpoReceipt(identity, receiptId);
  if (!receipt) throw new UpoIdentityMismatchError();
  return { invoice, receipt };
}
