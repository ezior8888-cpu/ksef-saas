/**
 * Admin refund operations (Faza 25 Krok 5 — rozszerzenie Fazy 24).
 *
 * Stripe refund flow:
 *   1. Admin klika "Wystaw refund" przy `stripe_payments` row
 *   2. `issueRefund` woła `stripe.refunds.create({ payment_intent })`
 *   3. INSERT do `stripe_refunds` z `triggered_by_user_id = admin`
 *   4. Email do klienta z `RefundIssued` template
 *   5. Audit log `billing.refund.issued`
 *
 * Nie obsługujemy partial refundów dla MVP — full refund only.
 */

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
  | { success: false; error: string };

export async function issueRefund(input: RefundPaymentInput): Promise<RefundResult> {
  const supabase = createAdminClient();

  // 1. Load payment z stripe_payments.
  const paymentResult = (await (supabase as unknown as {
    from: (n: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => {
          maybeSingle: () => Promise<{
            data: {
              id: string;
              tenant_id: string;
              stripe_payment_intent_id: string | null;
              stripe_charge_id: string | null;
              amount_cents: number;
              currency: string;
              status: string;
            } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('stripe_payments')
    .select(
      'id, tenant_id, stripe_payment_intent_id, stripe_charge_id, amount_cents, currency, status',
    )
    .eq('id', input.paymentId)
    .maybeSingle());

  if (!paymentResult.data) {
    return { success: false, error: 'Payment nie istnieje' };
  }
  const payment = paymentResult.data;

  if (payment.status !== 'succeeded') {
    return {
      success: false,
      error: `Refund możliwy tylko dla payment.status='succeeded' (aktualny: ${payment.status})`,
    };
  }

  if (!payment.stripe_payment_intent_id && !payment.stripe_charge_id) {
    return {
      success: false,
      error: 'Brak Stripe payment_intent / charge — nie ma czego refund',
    };
  }

  // 2. Wywołaj Stripe refund.
  const stripe = getStripe();
  try {
    const refund = await stripe.refunds.create({
      ...(payment.stripe_payment_intent_id
        ? { payment_intent: payment.stripe_payment_intent_id }
        : { charge: payment.stripe_charge_id! }),
      reason: 'requested_by_customer',
      metadata: {
        adminUserId: input.adminUserId,
        paymentId: payment.id,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });

    // 3. INSERT stripe_refunds.
    const refundRow = (await (supabase as unknown as {
      from: (n: string) => {
        insert: (row: Record<string, unknown>) => {
          select: (c: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    })
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
      .single());

    if (!refundRow.data) {
      return {
        success: false,
        error: `Stripe refund OK (${refund.id}) ale DB insert padł: ${refundRow.error?.message}`,
      };
    }

    // 4. Update payment status → refunded.
    await supabase
      .from('stripe_payments')
      .update({ status: 'refunded' })
      .eq('id', payment.id);

    // 5. Email do klienta (best-effort).
    void notifyCustomerOfRefund({
      tenantId: payment.tenant_id,
      amountCents: refund.amount,
      currency: refund.currency,
      reason: input.reason,
    });

    return {
      success: true,
      refundId: refundRow.data.id,
      stripeRefundId: refund.id,
    };
  } catch (err) {
    return {
      success: false,
      error: `Stripe refund failed: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
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
