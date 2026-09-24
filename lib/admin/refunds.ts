/**
 * Admin refund operations (Faza 25 Krok 5 — rozszerzenie Fazy 24).
 *
 * Stripe refund flow:
 *   1. Admin klika "Wystaw refund" przy `stripe_payments` row
 *   2. Claim w `stripe_refund_operations` przed kontaktem ze Stripe
 *   3. Pełny refund z trwałym Stripe idempotency key, potem INSERT do `stripe_refunds`
 *   4. Po potwierdzeniu sukcesu: payment.status=refunded i email do klienta
 *   5. Audit log `billing.refund.issued` w akcji admina
 *
 * Nie obsługujemy partial refundów dla MVP — full refund only.
 */

import * as Sentry from '@sentry/nextjs';
import type Stripe from 'stripe';

import { sendRefundIssuedEmail } from '@/lib/email/send';
import { getStripe } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

export interface RefundPaymentInput {
  paymentId: string;
  /** Admin który wystawia refund (do audit + `stripe_refunds.triggered_by_user_id`). */
  adminUserId: string;
  reason?: string;
}

export type RefundResult =
  | { success: true; refundId: string; stripeRefundId: string }
  | { success: false; error: string; reconciliationRequired?: boolean; operationPending?: boolean };

type Payment = {
  id: string;
  tenant_id: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
};

type RefundOperation = {
  status: 'processing' | 'reconciliation_required' | 'completed';
};

const RECONCILIATION_ERROR =
  'Nie można potwierdzić wyniku zwrotu. Sprawdź operację w Stripe i uzgodnij ją przed kolejną próbą.';

function needsReconciliation(): RefundResult {
  return { success: false, error: RECONCILIATION_ERROR, reconciliationRequired: true };
}

function operationPending(): RefundResult {
  return {
    success: false,
    error: 'Operacja zwrotu trwa. Jeśli wynik nie pojawi się wkrótce, uzgodnij go ze Stripe przed kolejną próbą.',
    operationPending: true,
  };
}

async function markForReconciliation(
  supabase: ReturnType<typeof createAdminClient>,
  paymentId: string,
  reason: string,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('stripe_refund_operations')
      .update({
        status: 'reconciliation_required',
        reconciliation_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_id', paymentId)
      .eq('status', 'processing')
      .select('payment_id')
      .maybeSingle();

    if (error || !data) {
      throw error ?? new Error('Refund operation reconciliation update matched no row');
    }
  } catch (error) {
    // The original processing row still blocks a second Stripe call.
    Sentry.captureException(error, {
      tags: { area: 'billing.refund.reconciliation' },
      extra: { paymentId, reason },
    });
  }
}

export async function issueRefund(input: RefundPaymentInput): Promise<RefundResult> {
  const supabase = createAdminClient();

  const { data: paymentData, error: paymentError } = await supabase
    .from('stripe_payments')
    .select(
      'id, tenant_id, stripe_payment_intent_id, stripe_charge_id, amount_cents, currency, status',
    )
    .eq('id', input.paymentId)
    .maybeSingle();

  if (paymentError) {
    return { success: false, error: 'Nie udało się odczytać płatności' };
  }
  if (!paymentData) {
    return { success: false, error: 'Payment nie istnieje' };
  }
  const payment = paymentData as Payment;

  if (payment.status !== 'succeeded') {
    return {
      success: false,
      error: 'Refund możliwy tylko dla payment.status=succeeded (aktualny: ' + payment.status + ')',
    };
  }
  if (!Number.isSafeInteger(payment.amount_cents) || payment.amount_cents <= 0) {
    return { success: false, error: 'Płatność nie ma dodatniej kwoty do zwrotu' };
  }
  if (!/^[A-Za-z]{3}$/.test(payment.currency)) {
    return { success: false, error: 'Nieprawidłowa waluta płatności' };
  }
  if (input.reason && input.reason.length > 500) {
    return { success: false, error: 'Powód zwrotu może mieć maksymalnie 500 znaków' };
  }
  if (!payment.stripe_payment_intent_id && !payment.stripe_charge_id) {
    return {
      success: false,
      error: 'Brak Stripe payment_intent / charge — nie ma czego refund',
    };
  }

  // 00075 backfills old refund rows, but also check directly in case a row was
  // written by older code after the migration. No new Stripe request is safe.
  const { data: priorRefunds, error: priorRefundsError } = await supabase
    .from('stripe_refunds')
    .select('id')
    .eq('payment_id', payment.id)
    .limit(1);
  if (priorRefundsError || !priorRefunds) {
    return { success: false, error: 'Nie udało się sprawdzić poprzednich zwrotów' };
  }
  if (priorRefunds.length > 0) {
    return needsReconciliation();
  }

  // PRIMARY KEY(payment_id) is the cross-request claim. An existing processing
  // row blocks retries even after Stripe has pruned the idempotency key.
  const idempotencyKey = 'admin-full-refund-v1:' + payment.id;
  const { error: claimError } = await supabase
    .from('stripe_refund_operations')
    .insert({
      payment_id: payment.id,
      tenant_id: payment.tenant_id,
      idempotency_key: idempotencyKey,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      stripe_payment_reference: payment.stripe_payment_intent_id ?? payment.stripe_charge_id,
      status: 'processing',
      requested_by_user_id: input.adminUserId,
      reason: input.reason ?? null,
    })
    .select('payment_id')
    .single();

  if (claimError) {
    if (claimError.code === '23505') {
      const { data: existing, error: readError } = await supabase
        .from('stripe_refund_operations')
        .select('status')
        .eq('payment_id', payment.id)
        .maybeSingle();
      if (readError || !existing) return needsReconciliation();
      if ((existing as RefundOperation).status === 'completed') {
        return { success: false, error: 'Zwrot tej płatności został już wykonany' };
      }
      if ((existing as RefundOperation).status === 'processing') {
        return operationPending();
      }
      return needsReconciliation();
    }
    return { success: false, error: 'Nie udało się zabezpieczyć operacji zwrotu' };
  }

  // Explicit full amount: an external partial refund must not silently turn
  // this request into a refund of only the remaining balance.
  let refund: Stripe.Refund;
  try {
    refund = await getStripe().refunds.create({
      ...(payment.stripe_payment_intent_id
        ? { payment_intent: payment.stripe_payment_intent_id }
        : { charge: payment.stripe_charge_id! }),
      amount: payment.amount_cents,
      reason: 'requested_by_customer',
      metadata: {
        adminUserId: input.adminUserId,
        paymentId: payment.id,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    }, { idempotencyKey });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { area: 'billing.refund.stripe' },
      extra: { paymentId: payment.id },
    });
    await markForReconciliation(supabase, payment.id, 'stripe_request_ambiguous');
    return needsReconciliation();
  }

  let refundId = '';
  try {
    // Persist the Stripe ID on the already claimed operation first. If another
    // write fails, the operator can locate the exact refund in Stripe.
    const { data: recordedOperation, error: recordError } = await supabase
      .from('stripe_refund_operations')
      .update({ stripe_refund_id: refund.id, updated_at: new Date().toISOString() })
      .eq('payment_id', payment.id)
      .eq('status', 'processing')
      .select('payment_id')
      .maybeSingle();
    if (recordError || !recordedOperation) {
      await markForReconciliation(supabase, payment.id, 'stripe_id_record_failed');
      return needsReconciliation();
    }

    const { data: refundData, error: refundError } = await supabase
      .from('stripe_refunds')
      .insert({
        tenant_id: payment.tenant_id,
        payment_id: payment.id,
        stripe_refund_id: refund.id,
        amount_cents: refund.amount,
        currency: refund.currency.toUpperCase(),
        reason: input.reason ?? null,
        status: refund.status ?? 'pending',
        triggered_by_user_id: input.adminUserId,
      })
      .select('id')
      .single();
    if (refundError || !refundData) {
      await markForReconciliation(supabase, payment.id, 'refund_record_failed');
      return needsReconciliation();
    }

    refundId = (refundData as { id: string }).id;
    if (refund.status !== 'succeeded') {
      await markForReconciliation(
        supabase,
        payment.id,
        'stripe_status_' + (refund.status ?? 'pending'),
      );
      return needsReconciliation();
    }

    const { data: updatedPayment, error: updateError } = await supabase
      .from('stripe_payments')
      .update({ status: 'refunded' })
      .eq('id', payment.id)
      .eq('status', 'succeeded')
      .select('id')
      .maybeSingle();
    if (updateError || !updatedPayment) {
      await markForReconciliation(supabase, payment.id, 'payment_status_update_failed');
      return needsReconciliation();
    }

    const { data: completed, error: completionError } = await supabase
      .from('stripe_refund_operations')
      .update({
        status: 'completed',
        refund_id: refundId,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_id', payment.id)
      .eq('status', 'processing')
      .select('payment_id')
      .maybeSingle();
    if (completionError || !completed) {
      await markForReconciliation(supabase, payment.id, 'operation_completion_failed');
      return needsReconciliation();
    }

  } catch (error) {
    Sentry.captureException(error, {
      tags: { area: 'billing.refund.persistence' },
      extra: { paymentId: payment.id, stripeRefundId: refund.id },
    });
    await markForReconciliation(supabase, payment.id, 'post_stripe_storage_exception');
    return needsReconciliation();
  }
  await notifyCustomerOfRefund({
    tenantId: payment.tenant_id,
    amountCents: refund.amount,
    currency: refund.currency,
    reason: input.reason,
  });

  return { success: true, refundId, stripeRefundId: refund.id };
}

/**
 * Wysłka emaila potwierdzenia. Best-effort — refund jest już wystawiony,
 * brak emaila to znaczy że admin musi powiadomić ręcznie (rzadkie).
 */
async function notifyCustomerOfRefund(params: {
  tenantId: string;
  amountCents: number;
  currency: string;
  reason?: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { data: membership } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('organization_id', params.tenantId)
      .eq('role', 'owner')
      .eq('status', 'active')
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership) return;

    const { data: userData } = await supabase.auth.admin.getUserById(membership.user_id);
    const email = userData.user?.email;
    if (!email) return;

    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', params.tenantId)
      .maybeSingle();

    const amountPln = (params.amountCents / 100).toLocaleString('pl-PL', {
      style: 'currency',
      currency: params.currency,
    });

    await sendRefundIssuedEmail(email, {
      tenantName: tenant?.name ?? email,
      amountLabel: amountPln,
      reason: params.reason ?? null,
    });
  } catch {
    // Best-effort.
  }
}
