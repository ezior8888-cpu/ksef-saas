import type { Database } from './database';

export type ReminderDeliveryStage = Database['public']['Enums']['reminder_stage_enum'];
export interface ReminderDelivery {
  version: 1;
  tenantId: string;
  invoiceId: string;
  stage: ReminderDeliveryStage;
  preparedAt: string;
  expiresAt: string;
  sourceFingerprint: string;
  from: string;
  to: string;
  replyTo: string | null;
  subject: string;
  text: string;
  attachment: { filename: string; contentBase64: string } | null;
  daysOverdue: number;
}

export type ReminderInvoiceSource = Pick<Database['public']['Tables']['invoices']['Row'],
  'id' | 'tenant_id' | 'gross_total' | 'paid_amount' | 'currency' | 'payment_status' |
  'direction' | 'ksef_status' | 'payment_due_date' | 'issue_date' | 'internal_number' |
  'ksef_number' | 'buyer_data' | 'buyer_nip' | 'payment_data' | 'seller_data' | 'reminders_paused'>;
