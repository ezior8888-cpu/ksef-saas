'use server';

import { randomUUID } from 'node:crypto';

import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';

import { logAuditSystem } from '@/lib/audit/log-system';
import { requireAdmin } from '@/lib/auth/admin-guard';
import { sendInvoiceDuplicateDecisionEmail } from '@/lib/email/send';
import { describeKsefSendError, ksefSendTransactionStep, type KsefSendMode } from '@/lib/invoices/ksef-send-step';
import {
  OPEN_SUBMISSION_STATUSES,
  OPERATOR_DUPLICATE_MESSAGES,
  OPERATOR_MESSAGES,
  operatorDuplicateDecisionButton,
  operatorDuplicateRefusalReason,
  operatorIssueDateMessage,
  operatorKindHeldMessage,
  operatorLegacyDataMessage,
  operatorReconcileButton,
  operatorRemindButton,
  operatorRequeueButton,
} from '@/lib/admin/ksef-operator-policy';
import { buildKsefRequeueEvent, KSEF_RESEND_SOURCE_COLUMNS, ksefResendFacts } from '@/lib/invoices/ksef-requeue-event';
import { describeResetError } from '@/lib/invoices/ksef-send-policy';
import { sendJobEvent } from '@/lib/jobs/enqueue';
import { configuredKsefEnvironment } from '@/lib/ksef/claim-environment';
import {
  DUPLICATE_DECISION_SQL_TEXTS,
  DUPLICATE_DECISION_TEXTS,
  duplicateDecisionOptions,
  duplicateMarker,
  fillSqlText,
  type DuplicateChoice,
  type DuplicateDecisionFacts,
  type DuplicateDecisionView,
  type DuplicateRefusalDetail,
} from '@/lib/ksef/duplicate-decision';
import { loadDuplicateDecisionFacts } from '@/lib/ksef/duplicate-decision-facts';
import {
  duplicateNoticeKey,
  findDuplicateNotices,
  recordDuplicateNotice,
} from '@/lib/ksef/duplicate-decision-notice';
import {
  callDecideKsefDuplicate,
  readDuplicateDecisionBlocker,
  type DuplicateRpcError,
} from '@/lib/ksef/duplicate-decision-rpc';
import { isKsefSubmissionPaused } from '@/lib/ksef/submission-holds';
import { createAdminClient } from '@/lib/supabase/admin';
import { readTenantOwnerContact } from '@/lib/supabase/admin-queries';

/**
 * Akcje operatora `/admin/ksef` (cykl życia faktury, PR 3c). Te same RPC
 * z 00131 co akcje klienta, ale z aktorem = operator i bez ograniczeń roli
 * w firmie. Każda akcja: `requireAdmin()` PRZED kluczem serwisowym, odczyt
 * wiersza, decyzja, zapis, audyt systemowy (`invoice.operator_*`).
 *
 * „Tylko uzgodnij” to `requeue_ksef_send(p_reconcile_only = true)` — runner
 * zaczyna od uzgodnienia po referencji, więc wymaga otwartego wpisu `sent`;
 * bez niego wysłałby fakturę od nowa, czego operator w tym trybie nie chce.
 *
 * Zdarzenie odtwarza `buildKsefRequeueEvent` z kopii na wierszu — także dla
 * KOR/ZAL/ROZ (A4b PR2a); decyzja jak przycisk (`operatorRequeueButton`,
 * `operatorReconcileButton`), z tymi samymi faktami.
 *
 * D-A4-1b-3 PR B: „Zapisz decyzję klienta” (RPC `decide_ksef_duplicate`
 * z `p_via = 'operator'`) i „Przypomnij klientowi” (e-mail, najwyżej raz na
 * 24 h) — ta sama polityka co przyciski (`duplicateDecisionOptions`, actor operator).
 */

export type OperatorActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

interface OperatorRow {
  id: string;
  tenant_id: string;
  direction: string | null;
  invoice_kind: string | null;
  issue_date: string | null;
  ksef_status: string | null;
  last_error_code: string | null;
  internal_number: string | null;
  fa3_data: unknown;
  special_data: unknown;
  tenants: { nip: string | null } | { nip: string | null }[] | null;
}

const OPERATOR_ROW_COLUMNS =
  `${KSEF_RESEND_SOURCE_COLUMNS}, id, tenant_id, direction, ksef_status, last_error_code, internal_number, tenants(nip)` as const;

async function loadRow(invoiceId: string): Promise<OperatorRow | null> {
  const { data, error } = await createAdminClient()
    .from('invoices')
    .select(OPERATOR_ROW_COLUMNS)
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw new Error(`invoice lookup: ${error.message}`);
  return (data as unknown as OperatorRow | null) ?? null;
}

export async function operatorRequeueAction(
  invoiceId: string,
  options: { reconcileOnly: boolean },
): Promise<OperatorActionResult> {
  const admin = await requireAdmin();
  const row = await loadRow(invoiceId);
  if (!row) return { success: false, error: OPERATOR_MESSAGES.notFound };
  const environment = configuredKsefEnvironment();
  const facts = ksefResendFacts(row, environment);
  const common = {
    direction: row.direction, status: row.ksef_status, invoiceKind: row.invoice_kind,
    facts, environmentKnown: environment !== null,
  };

  // Ta sama decyzja co przycisk (A4): klasa, środowisko, dane z kopii, rodzaj, data (decyzja b).
  const supabase = createAdminClient();
  let decision;
  if (options.reconcileOnly) {
    const { data: open, error } = await supabase
      .from('ksef_submissions')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', row.tenant_id)
      .in('status', [...OPEN_SUBMISSION_STATUSES])
      .limit(1);
    if (error) throw new Error(`ksef_submissions: ${error.message}`);
    decision = operatorReconcileButton({ ...common, openSent: (open ?? []).length > 0 });
  } else {
    decision = operatorRequeueButton({ ...common, errorCode: row.last_error_code });
  }
  if (!decision.enabled) return { success: false, error: decision.reason ?? OPERATOR_MESSAGES.reconcileClass };
  if (!environment) return { success: false, error: OPERATOR_MESSAGES.envUnknown };

  // Hamulec operatora — fail-closed, jak przy kolejkowaniu z akcji klienta.
  try {
    if (await isKsefSubmissionPaused()) return { success: false, error: OPERATOR_MESSAGES.paused };
  } catch {
    return { success: false, error: OPERATOR_MESSAGES.pausedUnknown };
  }

  // Zdarzenie z kopii na wierszu — ta sama definicja co cron (A4b PR2a).
  const built = buildKsefRequeueEvent(row, environment, randomUUID(), { reconcileOnly: options.reconcileOnly });
  if (!built.ok) {
    // Zwykle nieosiągalne po decyzji przycisku — chyba że minęła północ między krokami.
    const refusal = built.reason === 'missing-special-data' || built.reason === 'incomplete'
      ? operatorLegacyDataMessage(row.invoice_kind)
      : built.reason === 'kind-held'
        ? operatorKindHeldMessage(row.invoice_kind)
        : built.reason === 'issue-date'
          ? operatorIssueDateMessage(row.invoice_kind)
          : OPERATOR_MESSAGES.noNip;
    return { success: false, error: refusal };
  }
  const mode: KsefSendMode = { kind: 'requeue', actorUserId: admin.userId, reconcileOnly: options.reconcileOnly };
  const sendAttemptId = built.sendAttemptId;

  try {
    await sendJobEvent(
      built.event,
      { inTransaction: ksefSendTransactionStep(mode, { invoiceId: row.id, tenantId: row.tenant_id, attemptId: sendAttemptId }) },
    );
  } catch (e) {
    return { success: false, error: describeKsefSendError(e, mode) };
  }

  await logAuditSystem({
    action: options.reconcileOnly ? 'invoice.operator_reconcile' : 'invoice.operator_requeue',
    tenantId: row.tenant_id,
    userId: admin.userId,
    entityType: 'invoice',
    entityId: row.id,
    metadata: {
      operator: admin.email,
      internalNumber: row.internal_number,
      previousStatus: row.ksef_status,
      previousCode: row.last_error_code,
      sendAttemptId,
    },
  });
  revalidateViews(row.id);
  return { success: true, message: options.reconcileOnly ? OPERATOR_MESSAGES.reconcileQueued : OPERATOR_MESSAGES.requeued };
}

export async function operatorResetAction(invoiceId: string): Promise<OperatorActionResult> {
  const admin = await requireAdmin();
  const row = await loadRow(invoiceId);
  if (!row) return { success: false, error: OPERATOR_MESSAGES.notFound };
  if (row.direction !== 'outgoing') return { success: false, error: OPERATOR_MESSAGES.incoming };

  const { error } = await createAdminClient().rpc('reset_ksef_send', {
    p_invoice_id: row.id,
    p_tenant_id: row.tenant_id,
    p_actor_user_id: admin.userId,
  });
  if (error) return { success: false, error: describeResetError(error) };

  await logAuditSystem({
    action: 'invoice.operator_reset',
    tenantId: row.tenant_id,
    userId: admin.userId,
    entityType: 'invoice',
    entityId: row.id,
    metadata: {
      operator: admin.email,
      internalNumber: row.internal_number,
      previousStatus: row.ksef_status,
      previousCode: row.last_error_code,
    },
  });
  revalidateViews(row.id);
  return { success: true, message: OPERATOR_MESSAGES.reset };
}

/** Wejście „Zapisz decyzję klienta” (decyzja przekazana przez klienta). */
export type OperatorDecideDuplicateInput = {
  choice: DuplicateChoice;
  /** Skąd decyzja: kanał, data, osoba (co najmniej 10 znaków). */
  note: string;
  /** K i SHA-256 danych oryginału pokazanych operatorowi (wiązanie). */
  originalKsefNumber: string;
  originalSha256: string;
  /** Klient potwierdził „Rozumiem skutki” (decyzja 7 — sprawdzane na serwerze). */
  confirmed: boolean;
};

/** Minimalna długość notatki operatora (RPC sprawdza to samo: 22023 NOTE). */
const OPERATOR_NOTE_MIN_LENGTH = 10;

/** Fakty i widok decyzji klienta (actor operator) — klucz serwisowy, filtr firmy z wiersza. */
async function loadDuplicateDecision(row: OperatorRow): Promise<{
  facts: DuplicateDecisionFacts;
  view: DuplicateDecisionView;
}> {
  const facts = await loadDuplicateDecisionFacts(createAdminClient(), row.tenant_id, row.id);
  const view = duplicateDecisionOptions({
    facts,
    actor: 'operator',
    canManage: false,
    environment: configuredKsefEnvironment(),
    now: new Date(),
  });
  return { facts, view };
}

const choiceLabel = (choice: DuplicateChoice): string => (choice === 'same_sale' ? 'ta sama sprzedaż' : 'inna sprzedaż');

/**
 * Błąd RPC `decide_ksef_duplicate` → tekst dla operatora (jak akcja klienta
 * `decideKsefDuplicateAction`, przegląd PR B #3). Nie tekst resetu — ta akcja
 * nie przywraca szkicu.
 *  - P0001 — odmowa z bazy napisana dla człowieka (np. wpłata niewidoczna
 *    w `paid_amount`, decyzja zapisana równolegle: ALREADY) — bez zmian;
 *  - P0002 — faktura nie tej firmy;
 *  - 22023 z tekstem NOTE — baza policzyła notatkę krócej niż akcja;
 *  - reszta (22023 argumentów, 42501, XX000 „Unknown … blocker”, transport) to
 *    rozjazd TS↔SQL albo awaria — ogólny tekst decyzji i Sentry.
 */
function describeOperatorDecideError(
  error: DuplicateRpcError,
  context: { tenantId: string; invoiceId: string; choice: DuplicateChoice },
): string {
  if (error.code === 'P0001' && error.message) return error.message;
  if (error.code === 'P0002') return OPERATOR_MESSAGES.notFound;
  if (error.code === '22023' && error.message === DUPLICATE_DECISION_SQL_TEXTS.NOTE.template) {
    return OPERATOR_DUPLICATE_MESSAGES.noteError;
  }
  Sentry.captureException(new Error(`decide_ksef_duplicate (operator): błąd bazy ${error.code || 'bez kodu'}`), {
    tags: { area: 'ksef.duplicate-decision', kind: 'operator-decision' },
    extra: { ...context, code: error.code ?? null, message: error.message ?? null },
  });
  return DUPLICATE_DECISION_TEXTS.GENERIC;
}

/**
 * „Zapisz decyzję klienta” (D-A4-1b-3 PR B, spec §2.6.4; decyzje Bartosza
 * 04.10 i 07.10.2026 (7)). Operator zapisuje decyzję przekazaną przez klienta —
 * nie decyduje sam. Kolejność: `requireAdmin()` przed kluczem serwisowym →
 * fakty i polityka (te same reguły co RPC) → notatka → wiązanie z danymi
 * pokazanymi operatorowi → „Rozumiem skutki” klienta → RPC. RPC zapisuje
 * stan i swój audyt; akcja dopisuje `invoice.operator_duplicate_decision`
 * tylko przy nowej decyzji (`already_decided` false).
 * Ponowienie (podwójne kliknięcie): RPC odpowiada `already_decided` bez zapisów.
 */
export async function operatorDecideDuplicateAction(
  invoiceId: string,
  input: OperatorDecideDuplicateInput,
): Promise<OperatorActionResult> {
  const admin = await requireAdmin();
  const row = await loadRow(invoiceId);
  if (!row) return { success: false, error: OPERATOR_MESSAGES.notFound };
  if (input.choice !== 'same_sale' && input.choice !== 'other_sale') {
    return { success: false, error: DUPLICATE_DECISION_TEXTS.GENERIC };
  }

  const { view } = await loadDuplicateDecision(row);
  if (view.kind === 'decided') {
    // Zapisana wcześniej (zgubiona odpowiedź) — ta sama decyzja to sukces bez RPC i audytu.
    if (view.choice === input.choice && view.originalKsefNumber === input.originalKsefNumber) {
      return { success: true, message: OPERATOR_DUPLICATE_MESSAGES.success(input.choice) };
    }
    return {
      success: false,
      error: fillSqlText(DUPLICATE_DECISION_SQL_TEXTS.ALREADY.template, row.internal_number ?? '(bez numeru)', choiceLabel(view.choice)),
    };
  }
  const button = operatorDuplicateDecisionButton(view);
  if (view.kind !== 'decidable' || !button.enabled) {
    return { success: false, error: button.reason ?? OPERATOR_DUPLICATE_MESSAGES.notPending };
  }
  const environment = configuredKsefEnvironment();
  if (!environment) return { success: false, error: OPERATOR_MESSAGES.envUnknown };

  const note = (input.note ?? '').trim();
  // Znaki (punkty kodowe) jak `length()` w bazie — nie jednostki UTF-16 (emoji to dwie).
  if ([...note].length < OPERATOR_NOTE_MIN_LENGTH) return { success: false, error: OPERATOR_DUPLICATE_MESSAGES.noteError };
  if (view.originalKsefNumber !== input.originalKsefNumber || view.originalSha256 !== input.originalSha256) {
    return { success: false, error: DUPLICATE_DECISION_TEXTS.STALE };
  }
  if (view.needsConfirmation[input.choice] && !input.confirmed) {
    return { success: false, error: OPERATOR_DUPLICATE_MESSAGES.confirmMissing };
  }

  const { data, error } = await callDecideKsefDuplicate(createAdminClient(), {
    invoiceId: row.id,
    tenantId: row.tenant_id,
    actorUserId: admin.userId,
    choice: input.choice,
    via: 'operator',
    originalKsefNumber: view.originalKsefNumber,
    originalSha256: view.originalSha256,
    env: environment,
    note,
  });
  if (error) {
    return {
      success: false,
      error: describeOperatorDecideError(error, { tenantId: row.tenant_id, invoiceId: row.id, choice: input.choice }),
    };
  }

  if (data?.already_decided !== true) {
    await logAuditSystem({
      action: 'invoice.operator_duplicate_decision',
      tenantId: row.tenant_id,
      userId: admin.userId,
      entityType: 'invoice',
      entityId: row.id,
      metadata: {
        operator: admin.email,
        internalNumber: row.internal_number,
        choice: input.choice,
        note,
        originalKsefNumber: view.originalKsefNumber,
        reason: data?.reason ?? view.reason,
      },
    });
  }
  revalidateViews(row.id);
  return { success: true, message: OPERATOR_DUPLICATE_MESSAGES.success(input.choice) };
}

/** Wartości do tekstu odmowy z blokady SQL (widok `decidable` nie niesie `detail`). */
function refusalDetailFromFacts(facts: DuplicateDecisionFacts): DuplicateRefusalDetail {
  const marker = duplicateMarker(facts.submissions);
  const check = marker && typeof marker.original_check === 'object' && marker.original_check !== null
    ? (marker.original_check as Record<string, unknown>)
    : null;
  const paid = facts.invoice?.paid_amount;
  const paidAmount = typeof paid === 'number' ? paid : typeof paid === 'string' && paid.trim() !== '' ? Number(paid) : null;
  return {
    originalKsefNumber: marker?.original_ksef_number ?? null,
    reason: typeof check?.reason === 'string' ? check.reason : null,
    checkEnv: typeof check?.env === 'string' ? check.env : null,
    environment: configuredKsefEnvironment(),
    paidAmount: paidAmount !== null && Number.isFinite(paidAmount) ? paidAmount : null,
    knownInvoiceNumber: check?.reason === 'known-number' ? facts.knownInvoice?.internalNumber ?? 'bez numeru' : null,
  };
}

/**
 * „Przypomnij klientowi” (D-A4-1b-3 PR B, spec §2.6.4; decyzje Bartosza
 * 07.10.2026 (5), (12)): ponowny e-mail „Faktura … czeka na Twoją decyzję”,
 * najwyżej raz na 24 h. Blokada z bazy jest autorytatywna (wiersze `payments`).
 * Klucz Resend `…/przypomnienie-{n}` (n = liczba śladów przed kliknięciem):
 * podwójne kliknięcie przed zapisem śladu trafia w ten sam klucz, po zapisie
 * odmawia reguła 24 h. Bez pusha — tylko e-mail.
 */
export async function operatorRemindDuplicateDecisionAction(invoiceId: string): Promise<OperatorActionResult> {
  const admin = await requireAdmin();
  const row = await loadRow(invoiceId);
  if (!row) return { success: false, error: OPERATOR_MESSAGES.notFound };

  const { facts, view } = await loadDuplicateDecision(row);
  const decide = operatorDuplicateDecisionButton(view);
  if (view.kind !== 'decidable' || !decide.enabled) {
    return { success: false, error: decide.reason ?? OPERATOR_DUPLICATE_MESSAGES.notPending };
  }
  const blocker = await readDuplicateDecisionBlocker(createAdminClient(), row.id, row.tenant_id);
  if (blocker) return { success: false, error: operatorDuplicateRefusalReason(blocker, refusalDetailFromFacts(facts)) };

  const k = view.originalKsefNumber;
  const notices = await findDuplicateNotices(row.tenant_id, row.id, k);
  const remind = operatorRemindButton(decide, notices, new Date());
  if (!remind.enabled) return { success: false, error: remind.reason ?? OPERATOR_DUPLICATE_MESSAGES.notPending };

  // Wariant ścisły (przegląd PR B #1/#4): chwilowy błąd bazy albo GoTrue to nie
  // „firma nie ma adresu” — operator ponawia, a nie szuka innego kanału.
  let email: string | null;
  try {
    ({ email } = await readTenantOwnerContact(row.tenant_id));
  } catch (e) {
    Sentry.captureException(e, { tags: { area: 'ksef.duplicate-decision', kind: 'reminder-owner-read' }, extra: { invoiceId: row.id } });
    return { success: false, error: OPERATOR_DUPLICATE_MESSAGES.remindReadFailed };
  }
  if (!email) return { success: false, error: OPERATOR_DUPLICATE_MESSAGES.remindNoEmail };

  const idempotencyKey = duplicateNoticeKey(row.id, k, notices.count);
  let sent: Awaited<ReturnType<typeof sendInvoiceDuplicateDecisionEmail>>;
  try {
    sent = await sendInvoiceDuplicateDecisionEmail(
      email,
      { invoiceId: row.id, invoiceNumber: row.internal_number ?? 'bez numeru', ksefNumber: k, reminder: true },
      { idempotencyKey },
    );
  } catch (e) {
    Sentry.captureException(e, { tags: { area: 'ksef.duplicate-decision', kind: 'reminder' }, extra: { invoiceId: row.id } });
    return { success: false, error: OPERATOR_DUPLICATE_MESSAGES.remindNotSent('Resend') };
  }
  if (!sent.sent) return { success: false, error: OPERATOR_DUPLICATE_MESSAGES.remindNotSent(sent.reason ?? 'nieznany powód') };

  try {
    await recordDuplicateNotice({
      tenantId: row.tenant_id,
      invoiceId: row.id,
      ksefNumber: k,
      via: 'operator',
      idempotencyKey,
      emailed: true,
      pushSent: 0,
      reminder: notices.count,
      operatorEmail: admin.email,
      userId: admin.userId,
    });
  } catch (e) {
    Sentry.captureException(e, { tags: { area: 'ksef.duplicate-decision', kind: 'reminder-record' }, extra: { invoiceId: row.id } });
    return { success: false, error: OPERATOR_DUPLICATE_MESSAGES.remindSentNotRecorded };
  }
  revalidateViews(row.id);
  return { success: true, message: OPERATOR_DUPLICATE_MESSAGES.remindSuccess(email) };
}

function revalidateViews(invoiceId: string): void {
  revalidatePath('/admin/ksef');
  revalidatePath(`/admin/ksef/${invoiceId}`);
  revalidatePath('/invoices');
  revalidatePath(`/invoices/${invoiceId}`);
}
