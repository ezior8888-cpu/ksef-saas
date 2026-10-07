'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { logAuditSystem } from '@/lib/audit/log-system';
import { requireAdmin } from '@/lib/auth/admin-guard';
import { describeKsefSendError, ksefSendTransactionStep, type KsefSendMode } from '@/lib/invoices/ksef-send-step';
import {
  OPEN_SUBMISSION_STATUSES,
  OPERATOR_MESSAGES,
  operatorIssueDateMessage,
  operatorKindHeldMessage,
  operatorLegacyDataMessage,
  operatorReconcileButton,
  operatorRequeueButton,
} from '@/lib/admin/ksef-operator-policy';
import { buildKsefRequeueEvent, KSEF_RESEND_SOURCE_COLUMNS, ksefResendFacts } from '@/lib/invoices/ksef-requeue-event';
import { describeResetError } from '@/lib/invoices/ksef-send-policy';
import { sendJobEvent } from '@/lib/jobs/enqueue';
import { configuredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { isKsefSubmissionPaused } from '@/lib/ksef/submission-holds';
import { createAdminClient } from '@/lib/supabase/admin';

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

function revalidateViews(invoiceId: string): void {
  revalidatePath('/admin/ksef');
  revalidatePath(`/admin/ksef/${invoiceId}`);
  revalidatePath('/invoices');
  revalidatePath(`/invoices/${invoiceId}`);
}
