/**
 * Jedna ścieżka po zapisie szkicu: kolejka online. Gdy KSeF jest niedostępny,
 * pozostawiamy szkic; automatyczny Offline24 czeka na trwałą tożsamość próby.
 *
 * UWAGA: generacji XML ani uploadu R2 nie robimy w Server Action — robi to
 * `submitInvoiceFullFlow` w jobie Inngest (spójnie dla VAT / ZAL / ROZ / korekta).
 */

import { revalidatePath } from 'next/cache';
import { sendJobEvent } from '@/lib/jobs/enqueue';
import type { SupabaseClient } from '@supabase/supabase-js';

import { logAudit } from '@/lib/audit/log';
import {
  KsefNotVerifiedError,
  requireKsefVerification,
} from '@/lib/auth/ksef-verification-guard';
import { decryptCredentials } from '@/lib/ksef/credentials-crypto';
import { shouldUseOfflineMode } from '@/lib/ksef/health-check';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { formatInngestSendError } from '@/lib/inngest/error-message';
import type { AdvanceInvoiceSettlementRow } from '@/lib/ksef/fa3-advance-generator';
import type { Invoice } from '@/types/invoice';
import type {
  AdvanceInvoiceData,
  CorrectionInvoiceData,
  FinalInvoiceData,
} from '@/types/invoice-types';

export type KsefSubmitEnqueueResult =
  | { ok: true; mode: 'online_queued' }
  | { ok: false; error: string; code?: 'KSEF_NOT_VERIFIED' };

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

  try {
    await requireKsefVerification(tenantId);
  } catch (e) {
    if (e instanceof KsefNotVerifiedError) {
      return {
        ok: false,
        code: 'KSEF_NOT_VERIFIED',
        error:
          'Twoja organizacja musi najpierw zweryfikować certyfikat KSeF w Ustawieniach → KSeF.',
      };
    }
    throw e;
  }

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

  try {
    decryptCredentials(credentialsBuffer(tenantKsef.ksef_credentials_encrypted));
  } catch {
    return { ok: false, error: 'Nie można odczytać credentials KSeF.' };
  }

  const env = requireConfiguredKsefEnvironment();
  if (auditKind === 'correction' && env === 'production') {
    return {
      ok: false,
      error: 'Wysyłka korekt w PROD jest wstrzymana do uzgodnienia oryginału i wcześniejszych korekt. Dokument zapisano jako szkic.',
    };
  }
  if (auditKind === 'final' && env === 'production') {
    return {
      ok: false,
      error: 'Wysyłka faktury rozliczającej w PROD jest wstrzymana do czasu atomowego rozliczania zaliczek. Dokument zapisano jako szkic.',
    };
  }

  const health = await shouldUseOfflineMode(env);

  if (health.offline) {
    return {
      ok: false,
      error: 'KSeF jest niedostępny. Automatyczny Offline24 jest wstrzymany do uzgodnienia historii wysyłek; dokument zapisano jako szkic.',
    };
  }

  try {
    await sendJobEvent({
      // Grupa per tenant — odpowiednik `concurrency: { key: 'event.data.tenantId' }`
      // z Inngest (limit 100 równoległych wysyłek jednej organizacji).
      groupId: tenantId,
      name: 'invoice/submit.requested',
      data: {
        tenantId,
        invoiceId,
        invoice,
        nip: nipNorm,
        environment: env,
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
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .eq('ksef_status', 'draft')
    .is('submitted_to_ksef_at', null);

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
