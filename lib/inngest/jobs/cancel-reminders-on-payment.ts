// Gdy faktura zostanie zapłacona — anuluj wszystkie pending przypomnienia

import { invoicePaymentReceived, inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';

export const cancelRemindersOnPaymentJob = inngest.createFunction(
  {
    id: 'cancel-reminders-on-payment',
    name: 'Wkurzacz: anuluj przypomnienia po płatności',
    triggers: [invoicePaymentReceived],
  },
  async ({ event, step }) => {
    const { invoiceId } = event.data;
    const supabase = createAdminClient();

    const invoice = await step.run('check-invoice', async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('paid_amount, gross_total')
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
    const isFullyPaid = paid >= gross;

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

    return { cancelled: cancelled.count };
  },
);
