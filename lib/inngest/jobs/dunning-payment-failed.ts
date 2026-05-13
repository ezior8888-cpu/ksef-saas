/**
 * Dunning email po `billing/payment.failed` (Faza 25 Krok 5).
 *
 * Stripe robi własne Smart Retries + Dunning (włączane w Stripe Dashboard
 * → Settings → Subscriptions and emails). My dorzucamy 1 email natychmiast
 * z linkiem do `/settings/billing` żeby user mógł zaktualizować kartę.
 *
 * Bez follow-upów — Stripe pociągnie 2 dodatkowe próby przez 7 dni i pośle
 * własne smart-dunning emails. My nie chcemy duplikować.
 *
 * Idempotency: `billing_notifications` UNIQUE(entity_id, kind='payment_failed').
 * Jeden email per payment row, nawet jak Stripe retry'uje webhook.
 */

import { NonRetriableError } from 'inngest';

import { sendPaymentFailedEmail } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';

import { billingPaymentFailed, inngest } from '../client';
// `inngest` używany w `inngest.createFunction` poniżej.

function fmtPlnAmount(cents: number): string {
  const pln = cents / 100;
  return pln.toLocaleString('pl-PL', {
    style: 'currency',
    currency: 'PLN',
  });
}

export const dunningPaymentFailedJob = inngest.createFunction(
  {
    id: 'billing-dunning-payment-failed',
    name: 'Billing: dunning email po nieudanej płatności',
    retries: 3,
    concurrency: { key: 'event.data.tenantId', limit: 1 },
    triggers: [billingPaymentFailed],
  },
  async ({ event, step, logger }) => {
    const { tenantId, paymentId } = event.data;
    const supabase = createAdminClient();

    // 1. Load payment row (cast — tabela poza typed gen).
    const payment = await step.run('load-payment', async () => {
      const { data, error } = await (supabase as unknown as {
        from: (n: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => {
              maybeSingle: () => Promise<{
                data: {
                  id: string;
                  amount_cents: number;
                  failure_reason: string | null;
                } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from('stripe_payments')
        .select('id, amount_cents, failure_reason')
        .eq('id', paymentId)
        .maybeSingle();
      if (error) throw new Error(`payment lookup: ${error.message}`);
      if (!data) throw new NonRetriableError(`Payment ${paymentId} nie istnieje`);
      return data;
    });

    // 2. Idempotency claim.
    const claimRes = await supabase.from('billing_notifications').insert({
      tenant_id: tenantId,
      entity_id: paymentId,
      kind: 'payment_failed',
      recipient_email: 'pending',
      status: 'sending',
    });
    if (claimRes.error) {
      if (claimRes.error.code === '23505') {
        logger.info('dunning already sent — skip', { paymentId });
        return { skipped: true as const, reason: 'duplicate' };
      }
      throw new Error(`notification claim: ${claimRes.error.message}`);
    }

    // 3. Resolve owner email.
    const { data: membership } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('organization_id', tenantId)
      .eq('role', 'owner')
      .eq('status', 'active')
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership) {
      await supabase
        .from('billing_notifications')
        .update({ status: 'failed', error_message: 'no owner found' })
        .eq('entity_id', paymentId)
        .eq('kind', 'payment_failed');
      throw new NonRetriableError('Brak ownera dla tenanta — nie ma do kogo wysłać');
    }

    const { data: userData } = await supabase.auth.admin.getUserById(membership.user_id);
    const email = userData.user?.email;
    if (!email) {
      await supabase
        .from('billing_notifications')
        .update({ status: 'failed', error_message: 'owner has no email' })
        .eq('entity_id', paymentId)
        .eq('kind', 'payment_failed');
      throw new NonRetriableError('Owner bez emaila');
    }

    // 4. Tenant name dla personalizacji.
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle();

    // 5. Send.
    const result = await step.run('send-email', () =>
      sendPaymentFailedEmail(email, {
        tenantName: tenant?.name ?? email,
        amountLabel: fmtPlnAmount(payment.amount_cents),
        failureReason: payment.failure_reason,
      }),
    );

    // 6. Update status.
    await supabase
      .from('billing_notifications')
      .update({
        status: result.sent ? 'sent' : 'failed',
        recipient_email: email,
        resend_message_id: result.messageId ?? null,
        error_message: result.sent ? null : result.reason ?? null,
      })
      .eq('entity_id', paymentId)
      .eq('kind', 'payment_failed');

    return { sent: result.sent, email };
  },
);
