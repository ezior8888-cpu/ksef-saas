/**
 * Zarządzanie kolejką Trybu Offline24 (Inngest / job z service_role).
 */

import type { Database } from '@/types/database';

import { createAdminClient } from '@/lib/supabase/server';

import { calculateOfflineDeadline, generateIdempotencyKey } from './idempotency';

export interface AddToOfflineQueueParams {
  tenantId: string;
  invoiceId: string;
  isMfOutage: boolean;
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
      'tenant_id, created_at, ksef_status, ksef_number',
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
  if (invoiceRow.ksef_status === 'accepted') {
    throw new Error('Invoice already accepted before offline queueing');
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
      // Brak certyfikatu KSeF typu Offline i skrótu utrwalonego XML: nie
      // zapisujemy niezgodnych ze specyfikacją MF, pozornych payloadów QR.
      qr_offline_payload: null,
      qr_certyfikat_payload: null,
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
      const { data: current, error: currentError } = await supabase
        .from('invoices')
        .select('ksef_status')
        .eq('id', params.invoiceId)
        .eq('tenant_id', params.tenantId)
        .maybeSingle();
      if (currentError || !current) throw new Error('Invoice status unavailable after offline queue conflict');
      if (current.ksef_status === 'accepted') {
        throw new Error('Invoice already accepted during offline queueing');
      }
      return existing as OfflineQueueRow;
    }
    throw error;
  }

  const { data: updated, error: updErr } = await supabase
    .from('invoices')
    .update({
      ksef_status: 'offline_queued',
      offline_qr_offline: null,
      offline_qr_certyfikat: null,
      offline_idempotency_key: idempotencyKey,
    })
    .eq('id', params.invoiceId)
    .eq('tenant_id', params.tenantId)
    .or('ksef_status.is.null,ksef_status.neq.accepted')
    .select('id')
    .maybeSingle();

  if (updErr) throw new Error('Invoice could not be updated for offline queue');
  if (!updated) {
    const { data: current, error: currentError } = await supabase
      .from('invoices')
      .select('ksef_status, ksef_number')
      .eq('id', params.invoiceId)
      .eq('tenant_id', params.tenantId)
      .maybeSingle();
    if (currentError || !current) throw new Error('Invoice status unavailable after offline queue insert');
    if (current.ksef_status === 'accepted' && current.ksef_number) {
      const { error: reconcileError } = await supabase
        .from('ksef_offline_queue')
        .update({ status: 'sent', last_error: null })
        .eq('id', row.id)
        .eq('tenant_id', params.tenantId)
        .eq('invoice_id', params.invoiceId)
        .eq('status', 'queued');
      if (reconcileError) throw new Error('Accepted invoice queue could not be reconciled');
    }
    throw new Error('Invoice could not be updated for offline queue');
  }

  return row as OfflineQueueRow;
}
