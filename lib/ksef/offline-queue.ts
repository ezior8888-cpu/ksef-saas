/**
 * Zarządzanie kolejką Trybu Offline24 (Inngest / job z service_role).
 */

import type { Database } from '@/types/database';

import { createAdminClient } from '@/lib/supabase/server';

import { calculateOfflineDeadline, generateIdempotencyKey } from './idempotency';
import { generateOfflineQrCodes } from './qr-codes';

export interface AddToOfflineQueueParams {
  tenantId: string;
  invoiceId: string;
  isMfOutage: boolean;
  /** PEM certyfikatu (do skrótu w payloadzie QR CERTYFIKAT). */
  certificate: string;
}

type OfflineQueueRow = Database['public']['Tables']['ksef_offline_queue']['Row'];

export async function addToOfflineQueue(
  params: AddToOfflineQueueParams,
): Promise<OfflineQueueRow> {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: invoiceRow, error: invErr } = await supabase
    .from('invoices')
    .select(
      'tenant_id, internal_number, issue_date, gross_total, buyer_data, buyer_nip, seller_nip, created_at, tenants(nip)',
    )
    .eq('id', params.invoiceId)
    .eq('tenant_id', params.tenantId)
    .single();

  if (invErr || !invoiceRow) {
    throw new Error('Invoice not found for offline queue');
  }

  if (invoiceRow.tenant_id !== params.tenantId) {
    throw new Error('Invoice tenant mismatch for offline queue');
  }

  const idempotencySource = invoiceRow.created_at
    ? new Date(invoiceRow.created_at)
    : now;

  const idempotencyKey = generateIdempotencyKey(
    params.tenantId,
    params.invoiceId,
    idempotencySource,
  );
  const deadline = calculateOfflineDeadline(now, params.isMfOutage);

  const tenants = invoiceRow.tenants as
    | { nip: string }
    | { nip: string }[]
    | null;
  const tenantNipRow = Array.isArray(tenants) ? tenants[0] : tenants;
  const sellerNip = tenantNipRow?.nip ?? invoiceRow.seller_nip ?? '';

  type BuyerSnap = { nip?: unknown };
  const buyerNipRaw = invoiceRow.buyer_data as BuyerSnap | null;
  const buyerNipFromJson =
    typeof buyerNipRaw?.nip === 'string' ? buyerNipRaw.nip : '';
  const buyerNip = invoiceRow.buyer_nip ?? buyerNipFromJson;

  const qrCodes = await generateOfflineQrCodes({
    invoiceNumber: invoiceRow.internal_number?.trim() ?? '',
    issueDate: invoiceRow.issue_date,
    grossAmount: Number(invoiceRow.gross_total ?? 0),
    sellerNip,
    buyerNip,
    certificate: params.certificate,
    idempotencyKey,
  });

  const { data: row, error } = await supabase
    .from('ksef_offline_queue')
    .insert({
      tenant_id: params.tenantId,
      invoice_id: params.invoiceId,
      idempotency_key: idempotencyKey,
      status: 'queued',
      deadline: deadline.toISOString(),
      is_mf_outage: params.isMfOutage,
      attempts: 0,
      next_attempt_at: now.toISOString(),
      qr_offline_payload: qrCodes.offlinePayload,
      qr_certyfikat_payload: qrCodes.certyfikatPayload,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: fetchErr } = await supabase
        .from('ksef_offline_queue')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .eq('tenant_id', params.tenantId)
        .eq('invoice_id', params.invoiceId)
        .single();
      if (fetchErr || !existing) {
        throw new Error('Offline queue conflict could not be verified');
      }
      return existing as OfflineQueueRow;
    }
    throw error;
  }

  const { data: updated, error: updErr } = await supabase
    .from('invoices')
    .update({
      ksef_status: 'offline_queued',
      offline_qr_offline: qrCodes.offlinePayload,
      offline_qr_certyfikat: qrCodes.certyfikatPayload,
      offline_idempotency_key: idempotencyKey,
    })
    .eq('id', params.invoiceId)
    .eq('tenant_id', params.tenantId)
    .select('id')
    .single();

  if (updErr || !updated) throw new Error('Invoice could not be updated for offline queue');

  return row as OfflineQueueRow;
}
