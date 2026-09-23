import 'server-only';
import { ReminderConsentDenied } from './delivery-errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateChaseSafety } from '@/lib/flo/functions/payment-chase';
import { reminderInvoiceFingerprint } from './delivery-schema';
import type { ReminderDelivery } from '@/types/reminder-delivery';

/** Never place these reads in a separately cached durable step. */
export async function assertReminderSendable(delivery: ReminderDelivery) {
  const client = createAdminClient();
  const invoice = await client.from('invoices').select('*')
    .eq('id', delivery.invoiceId).eq('tenant_id', delivery.tenantId).maybeSingle();
  if (invoice.error) throw new Error('Nie można odczytać stanu faktury.');
  if (!invoice.data || invoice.data.tenant_id !== delivery.tenantId ||
      invoice.data.id !== delivery.invoiceId) throw new ReminderConsentDenied('Faktura nie należy do organizacji przypomnienia.');
  const row = invoice.data;
  if (reminderInvoiceFingerprint(row) !== delivery.sourceFingerprint) {
    throw new ReminderConsentDenied('Dane faktury zmieniły się po przygotowaniu wiadomości. Wysyłka wstrzymana.');
  }
  const recent = await client.from('payments').select('payment_date')
    .eq('tenant_id', delivery.tenantId).eq('invoice_id', delivery.invoiceId)
    .order('payment_date', { ascending: false }).limit(1);
  if (recent.error) throw new Error('Nie można sprawdzić ostatnich płatności.');
  const day = recent.data?.[0]?.payment_date;
  const outstanding = Number(row.gross_total) - Number(row.paid_amount);
  if (!Number.isFinite(outstanding) || row.gross_total === null || row.paid_amount === null) {
    throw new ReminderConsentDenied('Nieprawidłowa kwota należności.');
  }
  if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)) throw new ReminderConsentDenied('Nieprawidłowa data płatności.');
  const safety = evaluateChaseSafety({ outstanding, remindersPaused: row.reminders_paused,
    lastPaymentFromContractorAt: day ? day + 'T23:59:59.999Z' : null, now: new Date() });
  if (!safety.ok) throw new ReminderConsentDenied(safety.message);
  const buyer = row.buyer_data && typeof row.buyer_data === 'object' && !Array.isArray(row.buyer_data) ? row.buyer_data : {};
  const normalize = (value: unknown) => typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
  const columnNip = normalize(row.buyer_nip);
  const embeddedNip = normalize(buyer.nip);
  if (columnNip && embeddedNip && columnNip !== embeddedNip) throw new ReminderConsentDenied('Dane kontrahenta są niespójne.');
  const nip = columnNip || embeddedNip;
  if (nip) {
    const contractor = await client.from('contractors').select('reminder_excluded')
      .eq('tenant_id', delivery.tenantId).eq('nip', nip).maybeSingle();
    if (contractor.error) throw new Error('Nie można sprawdzić zgody kontrahenta na przypomnienia.');
    if (contractor.data?.reminder_excluded) throw new ReminderConsentDenied('Przypomnienia dla tego kontrahenta są wstrzymane.');
  }
}
