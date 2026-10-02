/**
 * Zarządzanie kolejką Trybu Offline24 (Inngest / job z service_role).
 */

import type { Database } from '@/types/database';

import { createAdminClient } from '@/lib/supabase/server';

import { calculateOfflineDeadline, generateIdempotencyKey } from './idempotency';
import { requireConfiguredKsefEnvironment } from './claim-environment';
import { isOfflineReplayableInvoice } from './offline-replay';

export interface AddToOfflineQueueParams {
  tenantId: string;
  invoiceId: string;
  isMfOutage: boolean;
}

type OfflineQueueRow = Database['public']['Tables']['ksef_offline_queue']['Row'];

export async function addToOfflineQueue(
  params: AddToOfflineQueueParams,
): Promise<OfflineQueueRow> {
  const environment = requireConfiguredKsefEnvironment();
  // C-12 (#122): bez certyfikatu KSeF typu Offline i skrótu utrwalonego XML
  // nie ma poprawnego KODU II — kolejka nie zapisuje żadnych payloadów QR,
  // a PDF przed numerem KSeF jest wstrzymany. PROD wyłączony do odbioru.
  if (environment === 'production') {
    throw new Error('Offline24 PROD is disabled until official KSeF QR I/II verification is complete');
  }
  const supabase = createAdminClient();
  const now = new Date();

  const { data: invoiceRow, error: invErr } = await supabase
    .from('invoices')
    .select(
      'tenant_id, invoice_kind, invoice_type, fa3_data, ksef_status, submitted_to_ksef_at, offline_idempotency_key, offline_qr_offline, offline_qr_certyfikat, internal_number, issue_date, gross_total, buyer_data, buyer_nip, seller_nip, created_at, tenants(nip, ksef_verified_at, ksef_verified_environment)',
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
  const observedStatus = invoiceRow.ksef_status;
  if (invoiceRow.submitted_to_ksef_at ||
      (observedStatus !== 'draft' &&
       observedStatus !== 'queued' &&
       observedStatus !== 'offline_queued')) {
    throw new Error('Invoice KSeF submission requires reconciliation before Offline24 queue');
  }
  const preClaimStatus = observedStatus;
  const preClaimOfflineKey = invoiceRow.offline_idempotency_key;
  const preClaimQrOffline = invoiceRow.offline_qr_offline;
  const preClaimQrCertyfikat = invoiceRow.offline_qr_certyfikat;

  const idempotencySource = invoiceRow.created_at
    ? new Date(invoiceRow.created_at)
    : now;

  const idempotencyKey = generateIdempotencyKey(
    params.tenantId,
    params.invoiceId,
    idempotencySource,
  );
  // Termin od daty wystawienia, dni robocze w Polsce (AUD-15, decyzja P1).
  const deadline = calculateOfflineDeadline(
    String(invoiceRow.issue_date ?? now.toISOString().slice(0, 10)),
    params.isMfOutage,
  );

  const tenants = invoiceRow.tenants as
    | { nip: string; ksef_verified_at: string | null; ksef_verified_environment: string | null }
    | { nip: string; ksef_verified_at: string | null; ksef_verified_environment: string | null }[]
    | null;
  const tenantNipRow = Array.isArray(tenants) ? tenants[0] : tenants;
  if (!tenantNipRow?.ksef_verified_at ||
      tenantNipRow.ksef_verified_environment !== environment) {
    throw new Error('KSeF offline queue tenant is not verified for configured environment');
  }

  // An already parked invoice is a read-only retry. In particular, never
  // regenerate its QR payloads or recreate a queue row after online sending.
  if (preClaimStatus === 'offline_queued') {
    const { data: existing, error: fetchErr } = await supabase
      .from('ksef_offline_queue')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .eq('tenant_id', params.tenantId)
      .eq('invoice_id', params.invoiceId)
      .maybeSingle();
    if (fetchErr || !existing) {
      throw new Error('Offline queue conflict could not be verified');
    }
    if (existing.ksef_environment !== environment) {
      throw new Error('Offline queue conflict has no matching KSeF environment');
    }
    if (existing.status !== 'queued') {
      throw new Error('Offline queue conflict is not active and requires reconciliation');
    }
    const { data: current, error: currentErr } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', params.invoiceId)
      .eq('tenant_id', params.tenantId)
      .eq('ksef_status', 'offline_queued')
      .eq('offline_idempotency_key', idempotencyKey)
      .is('submitted_to_ksef_at', null)
      .maybeSingle();
    if (currentErr || !current) {
      throw new Error('Offline queue conflict is not active and requires reconciliation');
    }
    return existing as OfflineQueueRow;
  }

  // Claim the exact state read above before publishing a replayable queue row.
  // Online sending also claims with submitted_to_ksef_at IS NULL; only one
  // transition can win. QR is kept off the invoice until the row is durable.
  const { data: claimed, error: claimErr } = await supabase
    .from('invoices')
    .update({
      ksef_status: 'offline_queued',
      offline_idempotency_key: idempotencyKey,
      offline_qr_offline: null,
      offline_qr_certyfikat: null,
    })
    .eq('id', params.invoiceId)
    .eq('tenant_id', params.tenantId)
    .eq('ksef_status', preClaimStatus)
    .is('submitted_to_ksef_at', null)
    .select('id')
    .maybeSingle();
  if (claimErr || !claimed) {
    throw new Error('Invoice could not be updated for offline queue');
  }

  const rollbackClaim = async () => {
    const { error: rollbackErr } = await supabase
      .from('invoices')
      .update({
        ksef_status: preClaimStatus,
        offline_idempotency_key: preClaimOfflineKey,
        offline_qr_offline: preClaimQrOffline,
        offline_qr_certyfikat: preClaimQrCertyfikat,
      })
      .eq('id', params.invoiceId)
      .eq('tenant_id', params.tenantId)
      .eq('ksef_status', 'offline_queued')
      .eq('offline_idempotency_key', idempotencyKey)
      .is('submitted_to_ksef_at', null);
    if (rollbackErr) {
      throw new Error('Offline queue claim rollback requires reconciliation');
    }
  };

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
      // Brak certyfikatu Offline i skrótu XML: żadnych pozornych payloadów QR.
      qr_offline_payload: null,
      qr_certyfikat_payload: null,
    })
    .select()
    .single();

  if (error) {
    await rollbackClaim();
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
      throw new Error(existing.status === 'queued'
        ? 'Offline queue conflict has no matching invoice claim and requires reconciliation'
        : 'Offline queue conflict is not active and requires reconciliation');
    }
    throw error;
  }

  // Confirm our claim still owns the invoice after the queue row is durable;
  // a concurrent send must not be overwritten. QR fields stay empty (C-12).
  const { data: updated, error: updErr } = await supabase
    .from('invoices')
    .update({
      offline_qr_offline: null,
      offline_qr_certyfikat: null,
    })
    .eq('id', params.invoiceId)
    .eq('tenant_id', params.tenantId)
    .eq('ksef_status', 'offline_queued')
    .eq('offline_idempotency_key', idempotencyKey)
    .is('submitted_to_ksef_at', null)
    .select('id')
    .maybeSingle();

  if (updErr || !updated) {
    // A fetched queue row is harmless after this conditional delete: its
    // worker must claim the still-queued row before sending anything.
    const { data: removed, error: removeErr } = await supabase
      .from('ksef_offline_queue')
      .delete()
      .eq('id', row.id)
      .eq('tenant_id', params.tenantId)
      .eq('invoice_id', params.invoiceId)
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'queued')
      .select('id')
      .maybeSingle();
    if (removeErr || !removed) {
      throw new Error('Offline queue QR cache requires reconciliation');
    }
    await rollbackClaim();
    throw new Error('Invoice could not be updated for offline queue');
  }

  return row as OfflineQueueRow;
}
