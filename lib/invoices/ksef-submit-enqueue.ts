/**
 * Jedna ścieżka po zapisie szkicu: kolejka Inngest (online) lub tryb Offline24,
 * jeśli KSeF jest niedostępny i tenant ma para certyfikat+klucz (XAdES).
 *
 * UWAGA: generacji XML ani uploadu R2 nie robimy w Server Action — robi to
 * `submitInvoiceFullFlow` w jobie Inngest (spójnie dla VAT / ZAL / ROZ / korekta).
 */

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { logAudit } from '@/lib/audit/log';
import { decryptCredentials } from '@/lib/ksef/credentials-crypto';
import { shouldUseOfflineMode } from '@/lib/ksef/health-check';
import { addToOfflineQueue } from '@/lib/ksef/offline-queue';
import { inngest } from '@/lib/inngest/client';
import { formatInngestSendError } from '@/lib/inngest/error-message';
import type { AdvanceInvoiceSettlementRow } from '@/lib/ksef/fa3-advance-generator';
import type { Invoice } from '@/types/invoice';
import type {
  AdvanceInvoiceData,
  CorrectionInvoiceData,
  FinalInvoiceData,
} from '@/types/invoice-types';

export type KsefSubmitEnqueueResult =
  | { ok: true; mode: 'online_queued' | 'offline_queued' }
  | { ok: false; error: string };

export interface EnqueueKsefSubmitParams {
  supabase: SupabaseClient;
  tenantId: string;
  userId: string;
  invoiceId: string;
  /** NIP tenanta (jak w dotychczasowych eventach Inngest). */
  nip: string;
  invoice: Invoice;
  correctionData?: CorrectionInvoiceData;
  advanceData?: AdvanceInvoiceData;
  finalData?: FinalInvoiceData;
  finalAdvanceSettlementRows?: AdvanceInvoiceSettlementRow[];
  auditKind: 'regular' | 'correction' | 'advance' | 'final';
  internalNumberForAudit?: string;
}

function credentialsBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === 'string') {
    if (raw.startsWith('\\x')) return Buffer.from(raw.slice(2), 'hex');
    return Buffer.from(raw, 'base64');
  }
  throw new Error('Niepoprawny typ kolumny credentials KSeF');
}

/** Komunikat gdy nie ma żadnego bloba credentials (różnice copy per typ). */
function missingCredentialsMessage(kind: EnqueueKsefSubmitParams['auditKind']): string {
  if (kind === 'regular') {
    return 'Najpierw wgraj certyfikat KSeF w Ustawienia KSeF — bez niego wysyłka nie jest możliwa. Faktura została zapisana jako szkic.';
  }
  return 'Brak certyfikatu KSeF — najpierw wgraj go w Ustawieniach. Dokument zapisany jako szkic.';
}

export async function enqueueKsefSubmitAfterDraft(
  params: EnqueueKsefSubmitParams,
): Promise<KsefSubmitEnqueueResult> {
  const {
    supabase,
    tenantId,
    userId,
    invoiceId,
    nip,
    invoice,
    correctionData,
    advanceData,
    finalData,
    finalAdvanceSettlementRows,
    auditKind,
    internalNumberForAudit,
  } = params;

  const nipNorm = nip.replace(/\s+/g, '');

  const { data: tenantKsef, error: tenantErr } = await supabase
    .from('tenants')
    .select('ksef_credentials_encrypted')
    .eq('id', tenantId)
    .single();

  if (tenantErr) {
    return {
      ok: false,
      error: `Nie można sprawdzić ustawień KSeF: ${tenantErr.message}`,
    };
  }

  if (!tenantKsef?.ksef_credentials_encrypted) {
    return { ok: false, error: missingCredentialsMessage(auditKind) };
  }

  let decrypted: ReturnType<typeof decryptCredentials>;
  try {
    decrypted = decryptCredentials(credentialsBuffer(tenantKsef.ksef_credentials_encrypted));
  } catch {
    return { ok: false, error: 'Nie można odczytać credentials KSeF.' };
  }

  const env = (process.env.KSEF_ENV as 'test' | 'demo' | 'production' | undefined) ?? 'test';

  const health = await shouldUseOfflineMode(env);

  if (health.offline && decrypted.type === 'xades') {
    try {
      await addToOfflineQueue({
        tenantId,
        invoiceId,
        isMfOutage: health.isMfOutage,
        certificate: decrypted.certificatePem,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Nie udało się dodać do kolejki offline';
      return { ok: false, error: msg };
    }

    await logAudit({
      action: 'invoice.submit_requested',
      tenantId,
      userId,
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: {
        nip: nipNorm,
        kind: auditKind,
        mode: 'offline_queued',
        internalNumber: internalNumberForAudit ?? invoice.internalNumber,
      },
    });

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true, mode: 'offline_queued' };
  }

  try {
    await inngest.send({
      name: 'invoice/submit.requested',
      data: {
        tenantId,
        invoiceId,
        invoice,
        nip: nipNorm,
        correctionData,
        advanceData,
        finalData,
        finalAdvanceSettlementRows,
      },
    });
  } catch (e) {
    return { ok: false, error: formatInngestSendError(e) };
  }

  const { error: queueErr } = await supabase
    .from('invoices')
    .update({ ksef_status: 'queued' })
    .eq('id', invoiceId);

  if (queueErr) {
    console.error('[enqueueKsefSubmitAfterDraft] queued status update failed', queueErr);
  }

  await logAudit({
    action: 'invoice.submit_requested',
    tenantId,
    userId,
    entityType: 'invoice',
    entityId: invoiceId,
    metadata: {
      nip: nipNorm,
      kind: auditKind,
      mode: 'online_queued',
      internalNumber: internalNumberForAudit ?? invoice.internalNumber,
    },
  });

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true, mode: 'online_queued' };
}
