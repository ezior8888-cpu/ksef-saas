/**
 * Zarządzanie kolejką Trybu Offline24 (Inngest / job z service_role).
 */

import type { Database } from '@/types/database';

import { createAdminClient } from '@/lib/supabase/server';

import { calculateOfflineDeadline, generateIdempotencyKey } from './idempotency';
import { requireConfiguredKsefEnvironment } from './claim-environment';
import { isOfflineReplayableInvoice } from './offline-replay';
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
  const environment = requireConfiguredKsefEnvironment();
  // QR I/II below are a prototype: they do not use the official XML hash,
  // Offline certificate serial/private key or verification URL. Never issue
  // them as a production legal document.
  if (environment === 'production') {
    throw new Error('Offline24 PROD is disabled until official KSeF QR I/II verification is complete');
  }
  const supabase = createAdminClient();
  const now = new Date();

  const { data: invoiceRow, error: invErr } = await supabase
    .from('invoices')
    .select(
      'tenant_id, invoice_kind, invoice_type, fa3_data, ksef_status, internal_number, issue_date, gross_total, buyer_data, buyer_nip, seller_nip, created_at, tenants(nip, ksef_verified_at, ksef_verified_environment)',
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
  if (!isOfflineReplayableInvoice(invoiceRow)) {
    throw new Error('Offline24 cannot safely replay correction, advance or final invoice data');
  }
  if (invoiceRow.ksef_status === 'accepted') {
    throw new Error('Accepted invoice cannot enter Offline24 queue');
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
    | { nip: string; ksef_verified_at: string | null; ksef_verified_environment: string | null }
    | { nip: string; ksef_verified_at: string | null; ksef_verified_environment: string | null }[]
    | null;
  const tenantNipRow = Array.isArray(tenants) ? tenants[0] : tenants;
  if (!tenantNipRow?.ksef_verified_at ||
      tenantNipRow.ksef_verified_environment !== environment) {
    throw new Error('KSeF offline queue tenant is not verified for configured environment');
  }
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
      ksef_environment: environment,
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
      if (existing.ksef_environment !== environment) {
        throw new Error('Offline queue conflict has no matching KSeF environment');
      }
      if (existing.status !== 'queued' || invoiceRow.ksef_status !== 'offline_queued') {
        throw new Error('Offline queue conflict is not active and requires reconciliation');
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
    .neq('ksef_status', 'accepted')
    .select('id')
    .single();

  if (updErr || !updated) throw new Error('Invoice could not be updated for offline queue');

  return row as OfflineQueueRow;
}
