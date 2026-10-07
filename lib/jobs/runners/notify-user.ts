import { createHash } from 'node:crypto';

import { requireInvoiceTenant } from './tenant-boundary';
import {
  invoiceSubmitFailed,
  invoiceSubmitSucceeded,
} from '../events';
import type { JobContext } from '@/lib/jobs/registry';
import {
  getTenantAdminEmail,
  getTenantOwnerUserId,
} from '@/lib/supabase/admin-queries';
import {
  sendInvoiceAcceptedEmail,
  sendInvoiceDuplicateDecisionEmail,
  sendInvoiceFailedEmail,
} from '@/lib/email/send';
import { sendPushToUser } from '@/lib/push/sender';
import { createAdminClient } from '@/lib/supabase/admin';
import { configuredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { DUPLICATE_DECISION_TEXTS, duplicateMarker } from '@/lib/ksef/duplicate-decision';
import {
  duplicateNoticeKey,
  findDuplicateNotices,
  recordDuplicateNotice,
} from '@/lib/ksef/duplicate-decision-notice';
import { readDuplicateDecisionBlocker } from '@/lib/ksef/duplicate-decision-rpc';
import { SEND_ERROR_CODES } from '@/lib/ksef/send-error-classes';
import { createProposal } from '@/lib/flo/proposals';
import {
  buildKsefStatusProposal,
  evaluateSubmission,
} from '@/lib/flo/functions/ksef-status';
import { buildKsefFixProposal } from '@/lib/flo/functions/ksef-fix';

/**
 * Notyfikacje per-użytkownik po zakończeniu wysyłki faktury.
 *
 * Oddzielone od `submitInvoiceJob` świadomie:
 *   - single-responsibility: submit robi KSeF, ten robi komunikację
 *   - niezależny retry: padnie Resend 503? Nie cofamy już wysłanej faktury
 *   - łatwo dołożyć kolejne kanały (Slack, push, in-app toast) jako nowe
 *     listenery tych samych eventów
 *
 * retries=2 bo email lepiej nie dostarczyć niż wysłać 4 razy.
 */

// ═══════════════════════════════════════════════════════════════
// SUKCES: faktura zaakceptowana przez KSeF
// ═══════════════════════════════════════════════════════════════

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runNotifySuccess(data: Parameters<typeof invoiceSubmitSucceeded.create>[0], { step, logger }: JobContext) {
    const { tenantId, invoiceId, ksefNumber } = data;
    await requireInvoiceTenant(invoiceId, tenantId);

    // Karta agenta (X-01). Powiadomienie znika, karta zostaje — i mówi
    // prawdę o tym, czy poświadczenie odbioru już jest. Przy kontroli
    // różnica między „wysłałem" a „mam UPO" jest całą różnicą.
    await step.run('flo-status-card', async () => {
      const supabase = createAdminClient();
      const { data: invoice } = await supabase
        .from('invoices')
        .select('internal_number, ksef_status, updated_at')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const { count } = await supabase
        .from('upo_receipts')
        .select('*', { count: 'exact', head: true })
        .eq('invoice_id', invoiceId)
        .eq('tenant_id', tenantId);

      const snapshot = {
        invoiceId,
        invoiceNumber: invoice?.internal_number ?? ksefNumber ?? 'bez numeru',
        state: 'accepted' as const,
        hasUpo: (count ?? 0) > 0,
        since: invoice?.updated_at ?? new Date().toISOString(),
        attempts: 1,
      };

      const proposal = buildKsefStatusProposal({
        tenantId,
        snapshot,
        verdict: evaluateSubmission(snapshot, new Date()),
      });
      if (proposal) await createProposal(proposal);
    });

    const email = await step.run('get-admin-email', () =>
      getTenantAdminEmail(tenantId),
    );

    const result = await step.run('send-email', async () => {
      if (!email) {
        return {
          sent: false as const,
          reason: 'no-admin-email' as const,
        };
      }
      // Faktura jest przyjmowana raz — ponowienie zadania nie wyśle drugi raz (AUD-86).
      return sendInvoiceAcceptedEmail(
        email,
        { ksefNumber, invoiceId },
        { idempotencyKey: `invoice-accepted/${invoiceId}` },
      );
    });

    if (!email) {
      logger.warn('Brak email dla tenanta — email pominięty, push dalej próbujemy', {
        tenantId,
        invoiceId,
      });
    }

    const pushResult = await step.run('send-push', async () => {
      const ownerId = await getTenantOwnerUserId(tenantId);
      if (!ownerId) {
        return { skipped: true as const, reason: 'no-owner' as const };
      }

      const supabase = createAdminClient();
      const { data: inv } = await supabase
        .from('invoices')
        .select('internal_number')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const label = inv?.internal_number?.trim()
        ? inv.internal_number
        : invoiceId.slice(0, 8);

      return sendPushToUser(ownerId, 'invoice_accepted', {
        title: '✅ Faktura zaakceptowana',
        body: `Faktura ${label} przeszła walidację KSeF`,
        url: `/invoices/${invoiceId}`,
        tag: `invoice-${invoiceId}`,
      });
    });

    logger.info('notify-success zakończone', {
      tenantId,
      invoiceId,
      emailTo: email,
      pushResult,
      ...result,
    });

    return { emailed: result.sent, reason: result.reason, push: pushResult };
}

// ═══════════════════════════════════════════════════════════════
// BŁĄD: faktura odrzucona lub retries wyczerpane
// ═══════════════════════════════════════════════════════════════

async function failureNotificationSuppression(
  invoiceId: string,
  tenantId: string,
): Promise<'already-accepted' | 'manual-reconciliation' | null> {
  const { data, error } = await createAdminClient()
    .from('invoices')
    .select('ksef_status, ksef_number, last_error_code')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) throw new Error('Nie można sprawdzić statusu faktury przed powiadomieniem');
  if (data.ksef_status === 'accepted' && data.ksef_number) return 'already-accepted';
  if (data.last_error_code === 'ROZ_HOLD_RECONCILE') return 'manual-reconciliation';
  return null;
}

type DuplicateDecisionNotice =
  /** Faktura nie czeka na decyzję klienta (blokada z bazy) — dalej jak dotąd. */
  | { pending: false }
  | { skipped: true; reason: 'duplicate-env' | 'already-notified' }
  | { notified: boolean; emailed: boolean; push: { sent: number; failed: number } | { skipped: true; reason: 'no-owner' } };

/**
 * D-A4-1b-3 PR B (decyzja Bartosza 07.10.2026 (5), spec §2.8): „Faktura {nr}
 * czeka na Twoją decyzję” — DOKŁADNIE RAZ na fakturę i numer KSeF oryginału.
 * Ponowienie od zera po każdym kroku:
 *   - blokada, znacznik i ślad — tylko odczyt (błąd odczytu śladu rzuca,
 *     więc nic nie wychodzi);
 *   - e-mail ze stałym kluczem `ksef-duplicate-decision/{faktura}/{K}` — Resend
 *     deduplikuje 24 h; push z tagiem `invoice-{faktura}` zastępuje poprzedni;
 *   - zapis śladu: błąd rzuca, ponowienie wysyła z tym samym kluczem i zapisuje;
 *     po zapisie każde kolejne zdarzenie o (fakturze, K) jest pomijane.
 * Niedostarczone (bez e-maila i pusha) nie zostawia śladu — następne zdarzenie
 * spróbuje znowu (precedens `cert-expiry-alert.ts`: zapis tylko po dostarczeniu).
 */
async function notifyDuplicateDecision(invoiceId: string, tenantId: string): Promise<DuplicateDecisionNotice> {
  const supabase = createAdminClient();
  // 1. Blokada z bazy (00148) — autorytatywna, obejmuje też wiersze `payments`.
  if (await readDuplicateDecisionBlocker(supabase, invoiceId, tenantId)) return { pending: false };

  // 2. Znacznik 440 (K) i numer dokumentu.
  const [{ data: rows, error: rowsError }, { data: invoice, error: invoiceError }] = await Promise.all([
    supabase
      .from('ksef_submissions')
      // `original_check` z 00144 — typy bazy dogenerujemy z produkcji po wgraniu.
      .select('id, status, original_ksef_number, original_check, attempted_at')
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', tenantId),
    supabase
      .from('invoices')
      .select('internal_number')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);
  if (rowsError) throw new Error(`Nie można odczytać historii wysyłki przed powiadomieniem: ${rowsError.message}`);
  if (invoiceError) throw new Error(`Nie można odczytać faktury przed powiadomieniem: ${invoiceError.message}`);
  type MarkerRow = { id: string; status: string; original_ksef_number: string | null; original_check: unknown; attempted_at: string | null };
  const marker = duplicateMarker((rows ?? []) as unknown as MarkerRow[]);
  const ksefNumber = marker?.original_ksef_number ?? null;
  // Blokada NULL zawsze ma znacznik; bez niego — ostrożnie jak dotąd (bez wiadomości).
  if (!marker || !ksefNumber) return { pending: false };
  const check = marker.original_check;
  const checkEnv = typeof check === 'object' && check !== null ? (check as { env?: unknown }).env : undefined;
  // Dane oryginału z innego środowiska KSeF — klient nie zapisze decyzji (RPC ENV); operator dostaje I5D-env.
  if (checkEnv !== configuredKsefEnvironment()) return { skipped: true, reason: 'duplicate-env' };

  // 3. Raz na (fakturę, K) — decyzja 5.
  const notices = await findDuplicateNotices(tenantId, invoiceId, ksefNumber);
  if (notices.count > 0) return { skipped: true, reason: 'already-notified' };

  const invoiceNumber = (invoice as { internal_number: string | null } | null)?.internal_number?.trim() || 'bez numeru';
  const idempotencyKey = duplicateNoticeKey(invoiceId, ksefNumber, null);

  // 4. E-mail do właściciela.
  const email = await getTenantAdminEmail(tenantId);
  const mail = email
    ? await sendInvoiceDuplicateDecisionEmail(
        email,
        { invoiceId, invoiceNumber, ksefNumber, reminder: false },
        { idempotencyKey },
      )
    : { sent: false as const, reason: 'no-admin-email' };
  const emailed = mail.sent === true;

  // 5. Push do właściciela (preferencja `notify_invoice_rejected`).
  const ownerId = await getTenantOwnerUserId(tenantId);
  const push = ownerId
    ? await sendPushToUser(ownerId, 'invoice_rejected', {
        title: DUPLICATE_DECISION_TEXTS.NOTICE.PUSH_TITLE(invoiceNumber),
        body: DUPLICATE_DECISION_TEXTS.NOTICE.PUSH_BODY,
        url: `/invoices/${invoiceId}`,
        tag: `invoice-${invoiceId}`,
      })
    : { skipped: true as const, reason: 'no-owner' as const };
  const pushSent = 'sent' in push ? push.sent : 0;

  // 6. Ślad tylko po dostarczeniu.
  const delivered = emailed || pushSent > 0;
  if (delivered) {
    await recordDuplicateNotice({
      tenantId,
      invoiceId,
      ksefNumber,
      via: 'auto',
      idempotencyKey,
      emailed,
      pushSent,
      reminder: null,
    });
  }
  return { notified: delivered, emailed, push };
}

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runNotifyFailure(data: Parameters<typeof invoiceSubmitFailed.create>[0], { step, logger }: JobContext) {
    const { tenantId, invoiceId, error, fromOfflineQueue } = data;
    await requireInvoiceTenant(invoiceId, tenantId);

    // D-A4-1b-3 PR B: nierozstrzygnięty 440, który czeka na decyzję klienta —
    // jedno powiadomienie „czeka na Twoją decyzję” zamiast milczenia (decyzja 5).
    // Bez karty FLO i maila „odrzucona”: faktura nie jest odrzucona.
    if (data.errorCode === SEND_ERROR_CODES.KSEF_DUPLICATE_RECONCILE) {
      const notice = await step.run('duplicate-decision-notice', () => notifyDuplicateDecision(invoiceId, tenantId));
      if (!('pending' in notice)) {
        logger.info('notify-failure: decyzja klienta przy duplikacie 440', { tenantId, invoiceId, ...notice });
        return notice;
      }
    }

    // A local ROZ hold is a manual reconciliation state, not KSeF rejection.
    // Suppress all rejection messages: an older worker may still accept it.
    if (data.manualReconciliationRequired) {
      return { skipped: true as const, reason: 'manual-reconciliation' as const };
    }
    const suppression = await failureNotificationSuppression(invoiceId, tenantId);
    if (suppression) {
      return { skipped: true as const, reason: suppression };
    }

    // Karta agenta (X-02). Tłumaczy odrzucenie i — gdy rozwiązanie jest
    // jedno — pokazuje gotową poprawkę z podglądem różnicy.
    await step.run('flo-fix-card', async () => {
      if (await failureNotificationSuppression(invoiceId, tenantId)) return;
      const supabase = createAdminClient();
      const { data: invoice } = await supabase
        .from('invoices')
        .select('internal_number, last_error_code')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const { count } = await supabase
        .from('ksef_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('invoice_id', invoiceId)
        .eq('tenant_id', tenantId);

      await createProposal(
        buildKsefFixProposal({
          tenantId,
          invoiceId,
          invoiceNumber: invoice?.internal_number ?? 'bez numeru',
          context: {
            code: String(invoice?.last_error_code ?? 'brak'),
            rawMessage: error,
            attempts: count ?? 1,
            // Kandydat na poprawkę wyliczy osobne zadanie; tutaj nie
            // zgadujemy, bo poprawka bez pewności jest gorsza od jej braku.
            candidate: undefined,
          },
        }),
      );
    });

    if (fromOfflineQueue) {
      logger.info(
        'Pomijam email o błędzie — faktura z kolejki Offline24 wraca do kolejki',
        { tenantId, invoiceId },
      );
      return {
        skipped: true as const,
        reason: 'offline-queue-retry' as const,
      };
    }

    const email = await step.run('get-admin-email', () =>
      getTenantAdminEmail(tenantId),
    );

    const result = await step.run('send-email', async () => {
      const suppression = await failureNotificationSuppression(invoiceId, tenantId);
      if (suppression) {
        return { sent: false as const, reason: suppression };
      }
      if (!email) {
        return {
          sent: false as const,
          reason: 'no-admin-email' as const,
        };
      }
      // Klucz z treści błędu: ponowienie tego samego zdarzenia trafia w ten
      // sam klucz, a nowe odrzucenie z innym powodem dostaje własny mail.
      // Ten sam powód drugi raz w ciągu doby (okno Resend) nie dubluje maila.
      const errorDigest = createHash('sha256').update(error).digest('hex').slice(0, 16);
      return sendInvoiceFailedEmail(
        email,
        { invoiceId, errorMessage: error },
        { idempotencyKey: `invoice-failed/${invoiceId}/${errorDigest}` },
      );
    });

    if (!email) {
      logger.warn('Brak email dla tenanta — email pominięty, push dalej próbujemy', {
        tenantId,
        invoiceId,
      });
    }

    const pushResult = await step.run('send-push', async () => {
      const suppression = await failureNotificationSuppression(invoiceId, tenantId);
      if (suppression) {
        return { skipped: true as const, reason: suppression };
      }
      const ownerId = await getTenantOwnerUserId(tenantId);
      if (!ownerId) {
        return { skipped: true as const, reason: 'no-owner' as const };
      }

      const supabase = createAdminClient();
      const { data: inv } = await supabase
        .from('invoices')
        .select('internal_number')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const label = inv?.internal_number?.trim()
        ? inv.internal_number
        : invoiceId.slice(0, 8);
      const errShort =
        error.length > 140 ? `${error.slice(0, 137)}…` : error;

      return sendPushToUser(ownerId, 'invoice_rejected', {
        title: 'Faktura odrzucona przez KSeF',
        body: `${label}: ${errShort}`,
        url: `/invoices/${invoiceId}`,
        tag: `invoice-${invoiceId}`,
      });
    });

    logger.info('notify-failure zakończone', {
      tenantId,
      invoiceId,
      emailTo: email,
      pushResult,
      ...result,
    });

    return { emailed: result.sent, reason: result.reason, push: pushResult };
}

