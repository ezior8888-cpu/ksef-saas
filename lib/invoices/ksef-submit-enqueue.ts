/**
 * Jedna ścieżka po zapisie szkicu: kolejka Inngest (online) lub tryb Offline24,
 * jeśli KSeF jest niedostępny i tenant ma para certyfikat+klucz (XAdES).
 *
 * UWAGA: generacji XML ani uploadu R2 nie robimy w Server Action — robi to
 * `submitInvoiceFullFlow` w jobie Inngest (spójnie dla VAT / ZAL / ROZ / korekta).
 */

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { sendJobEvent } from '@/lib/jobs/enqueue';
import type { SupabaseClient } from '@supabase/supabase-js';

import { logAudit } from '@/lib/audit/log';
import {
  KsefNotVerifiedError,
  requireKsefVerification,
} from '@/lib/auth/ksef-verification-guard';
import { decryptCredentials } from '@/lib/ksef/credentials-crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSensitiveMfa, SensitiveMfaRequiredError } from '@/lib/auth/sensitive-mfa';
import { shouldUseOfflineMode } from '@/lib/ksef/health-check';
import { isOffline24Enabled } from '@/lib/ksef/offline24-policy';
import { isRozSubmission, ROZ_SUBMISSION_HOLD_MESSAGE } from '@/lib/ksef/roz-submission-hold';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { addToOfflineQueue } from '@/lib/ksef/offline-queue';
import {
  isCorrectionHeldForEnv,
  isCorrectionSubmission,
  isKsefSubmissionPaused,
  KOR_HOLD_MESSAGE,
  KSEF_PAUSED_MESSAGE,
} from '@/lib/ksef/submission-holds';
import { formatJobSendError } from '@/lib/jobs/error-message';
import type { AdvanceInvoiceSettlementRow } from '@/lib/ksef/fa3-advance-generator';
import type { Invoice } from '@/types/invoice';
import type {
  AdvanceInvoiceData,
  CorrectionInvoiceData,
  FinalInvoiceData,
} from '@/types/invoice-types';

export type KsefSubmitEnqueueResult =
  | { ok: true; mode: 'online_queued' | 'offline_queued' }
  | { ok: false; error: string; code?: 'KSEF_NOT_VERIFIED' | 'MFA_REQUIRED' };

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

  // Covers existing ROZ drafts and callers that bypass the final invoice action.
  // Do this before both online and Offline24 enqueue paths.
  if (isRozSubmission({
    invoiceType: invoice.type,
    auditKind,
    finalData,
    finalAdvanceSettlementRows,
  })) {
    return { ok: false, error: ROZ_SUBMISSION_HOLD_MESSAGE };
  }

  // Krok 5: korekty wstrzymane na KSeF produkcyjnym (AUD-03/04) i globalny
  // wyłącznik operatora (AUD-63) — przed kolejką i przed Offline24.
  const ksefEnv = (process.env.KSEF_ENV as 'test' | 'demo' | 'production' | undefined) ?? 'test';
  if (
    isCorrectionHeldForEnv(ksefEnv) &&
    isCorrectionSubmission({ invoiceType: invoice.type, auditKind, correctionData })
  ) {
    return { ok: false, error: KOR_HOLD_MESSAGE };
  }
  try {
    if (await isKsefSubmissionPaused()) {
      return { ok: false, error: KSEF_PAUSED_MESSAGE };
    }
  } catch {
    // Bez pewności, że wyłącznik jest zdjęty, nie kolejkujemy (fail-closed).
    return {
      ok: false,
      error: 'Nie można sprawdzić, czy wysyłka do KSeF jest dostępna. Faktura została zapisana — spróbuj ponownie za chwilę.',
    };
  }

  // AAL2 właściciela/admina, gdy flaga `requireMfaForSensitive` jest włączona (AUD-65).
  try {
    await assertSensitiveMfa({ tenantId, userId }, 'ksef_submit');
  } catch (e) {
    if (e instanceof SensitiveMfaRequiredError) {
      return { ok: false, code: 'MFA_REQUIRED', error: e.message };
    }
    throw e;
  }

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

  // Blob czytamy kluczem serwisowym — rola kliencka nie ma do niego SELECT
  // (00112, AUD-103). Firma jest już zweryfikowana przez akcję wołającą.
  const { data: tenantKsef, error: tenantErr } = await createAdminClient()
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
    decrypted = decryptCredentials(credentialsBuffer(tenantKsef.ksef_credentials_encrypted), tenantId);
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

  // AUD-14: na KSeF produkcyjnym bez automatycznego Offline24 (`offline24-policy.ts`).
  const health = isOffline24Enabled(env)
    ? await shouldUseOfflineMode(env)
    : { offline: false as const, isMfOutage: false };

  if (health.offline && env === 'production') {
    return {
      ok: false,
      error: 'KSeF jest niedostępny. Offline24 w PROD jest wstrzymany do zgodności kodów QR z MF; dokument zapisano jako szkic.',
    };
  }

  // The Offline24 row stores only an invoice id. Its replay cannot reconstruct
  // KOR/ZAL/ROZ-specific legal XML, so never report those drafts as queued.
  if (health.offline && auditKind !== 'regular') {
    return {
      ok: false,
      error: 'KSeF jest niedostępny. Dokument specjalny zapisano jako szkic; ponów wysyłkę po przywróceniu KSeF.',
    };
  }

  if (health.offline && decrypted.type === 'xades') {
    try {
      await addToOfflineQueue({
        tenantId,
        invoiceId,
        isMfOutage: health.isMfOutage,
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
        // Właściciel przejęcia wysyłki (AUD-10): każde kolejkowanie to nowa próba.
        sendAttemptId: randomUUID(),
      },
    });
  } catch (e) {
    return { ok: false, error: formatJobSendError(e) };
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
