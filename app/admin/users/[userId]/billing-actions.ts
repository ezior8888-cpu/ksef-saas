'use server';

import { revalidatePath } from 'next/cache';

import { issueRefund } from '@/lib/admin/refunds';
import { STALE_REFUND_OPERATION_MS } from '@/lib/billing/refund-operations';
import { logAuditSystem } from '@/lib/audit/log-system';
import { requireAdmin } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase/admin';

export type AdminBillingActionResult =
  | { success: true; message?: string }
  | { success: false; error: string; reconciliationRequired?: boolean; operationPending?: boolean };

/**
 * Admin issue refund (Faza 25 Krok 5).
 *
 * Wywołanie:
 *   - `requireAdmin()` → audit trail + guard przed non-admin invocation
 *   - `issueRefund` → Stripe API + DB INSERT
 *   - Audit `billing.refund.issued` z kontekstem
 *   - Revalidate `/admin/users/[id]` i `/admin/users` (lista mogła pokazywać amount)
 */
export async function issueRefundAction(
  paymentId: string,
  reason: string | null,
): Promise<AdminBillingActionResult> {
  const admin = await requireAdmin();

  const result = await issueRefund({
    paymentId,
    adminUserId: admin.userId,
    reason: reason?.trim() || undefined,
  });

  if (!result.success) {
    if (result.reconciliationRequired) {
      const supabase = createAdminClient();
      const { data: payment } = await supabase.from('stripe_payments')
        .select('tenant_id').eq('id', paymentId).maybeSingle();
      await logAuditSystem({
        action: 'billing.refund.reconciliation_required',
        tenantId: payment?.tenant_id ?? null,
        userId: admin.userId,
        entityType: 'stripe_payment',
        entityId: paymentId,
        metadata: { adminEmail: admin.email, reason: reason ?? null },
      });
    }
    return { success: false, error: result.error,
      reconciliationRequired: result.reconciliationRequired, operationPending: result.operationPending };
  }

  // Audit + find tenantId from payment row for audit log scope.
  const supabase = createAdminClient();
  const { data: payment } = await supabase
    .from('stripe_payments')
    .select('tenant_id')
    .eq('id', paymentId)
    .maybeSingle();

  await logAuditSystem({
    action: 'billing.refund.issued',
    tenantId: payment?.tenant_id ?? null,
    userId: admin.userId,
    entityType: 'stripe_refund',
    entityId: result.refundId,
    metadata: {
      adminEmail: admin.email,
      paymentId,
      stripeRefundId: result.stripeRefundId,
      reason: reason ?? null,
    },
  });

  // Refresh detail page (admin sees updated payment status='refunded').
  revalidatePath('/admin/users');

  return {
    success: true,
    message: `Refund wystawiony (${result.stripeRefundId})`,
  };
}

/**
 * Read helper — payments + refunds dla danego user'a (po memberships).
 * Używany w detail page komponencie.
 */
export interface UserPaymentRow {
  paymentId: string;
  tenantId: string;
  tenantName: string;
  stripeInvoiceId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  paidAt: string | null;
  refundedAmountCents: number;
  refundOperationStatus: 'processing' | 'reconciliation_required' | 'completed' | null;
  refundOperationStale: boolean;
}

export async function listUserPayments(userId: string): Promise<UserPaymentRow[]> {
  await requireAdmin();
  const supabase = createAdminClient();

  // 1. Find tenants where user is member.
  const { data: memberships } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  const tenantIds = (memberships ?? []).map((m) => m.organization_id);
  if (tenantIds.length === 0) return [];

  // 2. Load payments + refunds aggregated.
  const result = (await (supabase as unknown as {
    from: (n: string) => {
      select: (c: string) => {
        in: (k: string, v: string[]) => {
          order: (k: string, opts: { ascending: boolean }) => Promise<{
            data: Array<{
              id: string;
              tenant_id: string;
              stripe_invoice_id: string | null;
              amount_cents: number;
              currency: string;
              status: string;
              paid_at: string | null;
              tenants: { name: string } | { name: string }[] | null;
            }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('stripe_payments')
    .select(
      'id, tenant_id, stripe_invoice_id, amount_cents, currency, status, paid_at, tenants(name)',
    )
    .in('tenant_id', tenantIds)
    .order('paid_at', { ascending: false }));

  if (!result.data || result.data.length === 0) return [];

  // 3. Suma refundów per payment.
  const { data: refunds, error: refundReadError } = await supabase
    .from('stripe_refunds')
    .select('payment_id, amount_cents, status')
    .in('payment_id', result.data.map((p) => p.id));
  if (refundReadError || !refunds) {
    throw new Error('Nie można potwierdzić zapisanych zwrotów.');
  }

  // A failed operation read must not reveal a new refund button.
  const operationResult = await (supabase as unknown as {
    from: (name: string) => {
      select: (columns: string) => {
        in: (column: string, ids: string[]) => Promise<{
          data: Array<{ payment_id: string; status: 'processing' | 'reconciliation_required' | 'completed'; created_at: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  }).from('stripe_refund_operations')
    .select('payment_id, status, created_at')
    .in('payment_id', result.data.map((p) => p.id));
  if (operationResult.error || !operationResult.data) {
    throw new Error('Nie można potwierdzić stanu operacji zwrotu.');
  }
  const operationByPayment = new Map(operationResult.data.map((row) => [row.payment_id, row]));

  const refundsByPayment = new Map<string, number>();
  for (const r of refunds as Array<{ payment_id: string; amount_cents: number; status: string }>) {
    if (r.status !== 'succeeded') continue;
    refundsByPayment.set(
      r.payment_id,
      (refundsByPayment.get(r.payment_id) ?? 0) + r.amount_cents,
    );
  }

  return result.data.map((row) => {
    const tenantSnap = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    const operation = operationByPayment.get(row.id);
    const operationAgeMs = operation ? Date.now() - Date.parse(operation.created_at) : 0;
    return {
      paymentId: row.id,
      tenantId: row.tenant_id,
      tenantName: tenantSnap?.name ?? '—',
      stripeInvoiceId: row.stripe_invoice_id,
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      paidAt: row.paid_at,
      refundedAmountCents: refundsByPayment.get(row.id) ?? 0,
      refundOperationStatus: operation?.status ?? null,
      refundOperationStale: operation?.status === 'processing'
        && Number.isFinite(operationAgeMs)
        && operationAgeMs >= STALE_REFUND_OPERATION_MS,
    };
  });
}
