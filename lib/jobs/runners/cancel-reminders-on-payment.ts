// Gdy faktura zostanie zapłacona — anuluj wszystkie pending przypomnienia

import { invoicePaymentReceived } from '@/lib/jobs/events';
import type { JobContext } from '@/lib/jobs/registry';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToTenant } from '@/lib/push/sender';
import { amountDueOf } from '@/lib/invoices/amount-due';

/**
 * Runner joba (worker pg-boss).
 * Rejestracja pg-boss: lib/jobs/handlers/package-b.ts
 */
export async function runCancelRemindersOnPayment(data: Parameters<typeof invoicePaymentReceived.create>[0], { step }: JobContext) {
    const { invoiceId } = data;
    const supabase = createAdminClient();

    const invoice = await step.run('check-invoice', async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('paid_amount, gross_total, tenant_id, internal_number, invoice_kind, payment_data')
        .eq('id', invoiceId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data;
    });

    if (!invoice) {
      return { skipped: true as const, reason: 'invoice-not-found' as const };
    }

    const paid = Number(invoice.paid_amount ?? 0);
    const gross = Number(invoice.gross_total ?? 0);
    // ROZ: zapłacona w całości znaczy „paid >= payment_data.amountDue”, nie
    // „paid >= gross_total” — inaczej ROZ ze rozliczoną zaliczką nigdy nie
    // odwołałaby swoich przypomnień (C-16, 00145).
    const due = amountDueOf({
      invoice_kind: invoice.invoice_kind, gross_total: invoice.gross_total,
      payment_data: invoice.payment_data,
    });
    const isFullyPaid = paid >= due;

    if (!isFullyPaid || gross <= 0) {
      return {
        skipped: true as const,
        reason:
          gross <= 0
            ? ('brak_kwoty_brutto' as const)
            : ('Częściowa płatność - nie anulujemy' as const),
      };
    }

    const cancelled = await step.run('cancel-pending-reminders', async () => {
      const { data, error } = await supabase
        .from('payment_reminders')
        .update({
          status: 'cancelled',
          failure_reason: 'Faktura zapłacona',
        })
        .eq('invoice_id', invoiceId)
        .eq('status', 'pending')
        .select('id');

      if (error) throw new Error(error.message);
      return { count: data?.length ?? 0 };
    });

    const pushResult = await step.run('push-payment-received', async () => {
      if (!invoice.tenant_id) {
        return { skipped: true as const, reason: 'no-tenant' as const };
      }
      const label = invoice.internal_number?.trim()
        ? invoice.internal_number
        : invoiceId.slice(0, 8);
      return sendPushToTenant(invoice.tenant_id, 'payment_received', {
        title: 'Faktura opłacona',
        body: `Pełna zapłata · ${label}`,
        url: '/payments',
        tag: `payment-${invoiceId}`,
      });
    });

    return { cancelled: cancelled.count, push: pushResult };
}

