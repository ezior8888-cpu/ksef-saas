'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { logAuditSystem } from '@/lib/audit/log-system';
import { requireAdmin } from '@/lib/auth/admin-guard';
import { describeKsefSendError, ksefSendTransactionStep, type KsefSendMode } from '@/lib/invoices/ksef-send-step';
import { OPEN_SUBMISSION_STATUSES, OPERATOR_MESSAGES, operatorRequeueButton } from '@/lib/admin/ksef-operator-policy';
import { describeResetError } from '@/lib/invoices/ksef-send-policy';
import { sendJobEvent } from '@/lib/jobs/enqueue';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { isKsefSubmissionPaused } from '@/lib/ksef/submission-holds';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Invoice } from '@/types/invoice';

/**
 * Akcje operatora `/admin/ksef` (cykl życia faktury, PR 3c). Te same RPC
 * z 00131 co akcje klienta, ale z aktorem = operator i bez ograniczeń roli
 * w firmie. Każda akcja: `requireAdmin()` PRZED kluczem serwisowym, odczyt
 * wiersza, decyzja, zapis, audyt systemowy (`invoice.operator_*`).
 *
 * „Tylko uzgodnij” to `requeue_ksef_send(p_reconcile_only = true)` — runner
 * zaczyna od uzgodnienia po referencji, więc wymaga otwartego wpisu `sent`;
 * bez niego wysłałby fakturę od nowa, czego operator w tym trybie nie chce.
 */

export type OperatorActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

interface OperatorRow {
  id: string;
  tenant_id: string;
  direction: string | null;
  invoice_kind: string | null;
  ksef_status: string | null;
  last_error_code: string | null;
  internal_number: string | null;
  fa3_data: unknown;
  tenants: { nip: string | null } | { nip: string | null }[] | null;
}

async function loadRow(invoiceId: string): Promise<OperatorRow | null> {
  const { data, error } = await createAdminClient()
    .from('invoices')
    .select('id, tenant_id, direction, invoice_kind, ksef_status, last_error_code, internal_number, fa3_data, tenants(nip)')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw new Error(`invoice lookup: ${error.message}`);
  return (data as OperatorRow | null) ?? null;
}

export async function operatorRequeueAction(
  invoiceId: string,
  options: { reconcileOnly: boolean },
): Promise<OperatorActionResult> {
  const admin = await requireAdmin();
  const row = await loadRow(invoiceId);
  if (!row) return { success: false, error: OPERATOR_MESSAGES.notFound };
  if (row.direction !== 'outgoing') return { success: false, error: OPERATOR_MESSAGES.incoming };
  if ((row.invoice_kind ?? 'regular') !== 'regular') return { success: false, error: OPERATOR_MESSAGES.special };
  const invoice = row.fa3_data as Invoice | null;
  if (!invoice || typeof invoice !== 'object' || !Array.isArray(invoice.lines)) {
    return { success: false, error: OPERATOR_MESSAGES.incomplete };
  }
  // Ta sama decyzja co przycisk (A4): klasa terminal, cudzy duplikat, inne środowisko.
  if (!options.reconcileOnly) {
    const decision = operatorRequeueButton({
      direction: row.direction, status: row.ksef_status, errorCode: row.last_error_code, invoiceKind: row.invoice_kind,
    });
    if (!decision.enabled) return { success: false, error: decision.reason ?? OPERATOR_MESSAGES.reconcileClass };
  }

  const supabase = createAdminClient();
  if (options.reconcileOnly) {
    const { data: open, error } = await supabase
      .from('ksef_submissions')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', row.tenant_id)
      .in('status', [...OPEN_SUBMISSION_STATUSES])
      .limit(1);
    if (error) throw new Error(`ksef_submissions: ${error.message}`);
    if (!open || open.length === 0) return { success: false, error: OPERATOR_MESSAGES.noOpenSent };
  }

  // Hamulec operatora — fail-closed, jak przy kolejkowaniu z akcji klienta.
  try {
    if (await isKsefSubmissionPaused()) return { success: false, error: OPERATOR_MESSAGES.paused };
  } catch {
    return { success: false, error: OPERATOR_MESSAGES.pausedUnknown };
  }

  const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
  const nip = (tenant?.nip ?? invoice.seller?.nip ?? '').replace(/\s+/g, '');
  if (!nip) return { success: false, error: OPERATOR_MESSAGES.noNip };
  const environment = requireConfiguredKsefEnvironment();
  const mode: KsefSendMode = { kind: 'requeue', actorUserId: admin.userId, reconcileOnly: options.reconcileOnly };
  const sendAttemptId = randomUUID();

  try {
    await sendJobEvent(
      {
        groupId: row.tenant_id,
        singletonKey: row.id,
        name: 'invoice/submit.requested',
        data: {
          tenantId: row.tenant_id,
          invoiceId: row.id,
          invoice,
          nip,
          environment,
          sendAttemptId,
          // Runner w tym trybie nigdy nie wysyła od nowa (brak wpisu sent → RESULT_UNCERTAIN).
          ...(options.reconcileOnly ? { reconcileOnly: true } : {}),
        },
      },
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
