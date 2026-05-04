// Wysyłka pojedynczego przypomnienia (email + ewentualnie PDF)

import { NonRetriableError } from 'inngest';
import { Resend } from 'resend';

import { inngest, remindersSendRequested } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateDemandLetterPdf } from '@/lib/reminders/pdf-demand-letter';
import {
  DEFAULT_TEMPLATES,
  formatDatePl,
  formatPln,
  resolveTemplate,
} from '@/lib/reminders/templates';
import { uploadToR2, downloadFromR2 } from '@/lib/storage/r2';
import type { Database, Json } from '@/types/database';

type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
type TenantPick = Pick<
  Database['public']['Tables']['tenants']['Row'],
  'name' | 'nip' | 'address_json'
>;
type ReminderRow = Database['public']['Tables']['payment_reminders']['Row'];
type ReminderStage = Database['public']['Enums']['reminder_stage_enum'];

type ReminderWithRelations = ReminderRow & {
  invoices:
    | (InvoiceRow & {
        tenants: TenantPick | null;
      })
    | null;
};

const DEFAULT_FALLBACK_DOMAIN = 'twoja-domena.pl';

const DEV_TO_OVERRIDE = process.env.RESEND_DEV_TO_OVERRIDE?.trim() || null;

function isReminderStagePdf(stage: ReminderStage): boolean {
  return stage === 'stage_3' || stage === 'stage_4';
}

export const sendReminderJob = inngest.createFunction(
  {
    id: 'send-reminder',
    name: 'Wkurzacz: wysyłka emaila',
    retries: 3,
    concurrency: { limit: 5 },
    triggers: [remindersSendRequested],
  },
  async ({ event, step }) => {
    const { reminderId } = event.data;
    const supabase = createAdminClient();

    const reminder = await step.run('fetch-reminder', async () => {
      const { data, error } = await supabase
        .from('payment_reminders')
        .select('*, invoices(*, tenants(name, nip, address_json))')
        .eq('id', reminderId)
        .single();

      if (error || !data) {
        throw new NonRetriableError(`Reminder ${reminderId} not found`);
      }
      return data as ReminderWithRelations;
    });

    if (reminder.status !== 'pending') {
      return {
        skipped: true as const,
        reason: `already-${reminder.status}` as const,
      };
    }

    const stillNeedsReminder = await step.run('verify-still-needed', async () => {
      const invoice = reminder.invoices;
      if (!invoice) return false;
      const gross = Number(invoice.gross_total ?? 0);
      const paid = Number(invoice.paid_amount ?? 0);
      const stillUnpaid = paid < gross;
      const notPaused = !invoice.reminders_paused;
      return stillUnpaid && notPaused;
    });

    if (!stillNeedsReminder) {
      await step.run('mark-cancelled', async () => {
        const invoice = reminder.invoices;
        const failureReason =
          invoice?.reminders_paused === true
            ? 'Przypomnienia zapauzowane'
            : 'Faktura zapłacona przed wysyłką';
        const { error } = await supabase
          .from('payment_reminders')
          .update({
            status: 'cancelled',
            failure_reason: failureReason,
          })
          .eq('id', reminderId);
        if (error) throw new Error(error.message);
      });
      return { skipped: true as const, reason: 'no-longer-needed' as const };
    }

    const invoice = reminder.invoices;
    if (!invoice) {
      throw new NonRetriableError('Brak faktury dla przypomnienia');
    }
    const tenant = invoice.tenants;
    if (!tenant) {
      throw new NonRetriableError('Brak tenanta dla przypomnienia');
    }

    const settings = await step.run('fetch-settings', async () => {
      const { data, error } = await supabase
        .from('reminder_settings')
        .select('*')
        .eq('tenant_id', reminder.tenant_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    });

    const templateSource = await step.run('fetch-template', async () => {
      const { data: row, error } = await supabase
        .from('reminder_templates')
        .select('email_subject, email_body')
        .eq('tenant_id', reminder.tenant_id)
        .eq('stage', reminder.stage)
        .eq('is_default', false)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (
        row &&
        row.email_subject?.trim()?.length &&
        row.email_body?.trim()?.length
      ) {
        return { subject: row.email_subject, body: row.email_body };
      }

      const def = DEFAULT_TEMPLATES[reminder.stage];
      if (!def) {
        throw new NonRetriableError(`Brak szablonu dla etapu ${reminder.stage}`);
      }
      return def;
    });

    const daysOverdue = calendarDaysOverdue(invoice.payment_due_date);

    const amountDue = Math.max(
      0,
      Number(invoice.gross_total ?? 0) - Number(invoice.paid_amount ?? 0),
    );

    const buyer = readBuyerParty(invoice.buyer_data);
    const invoiceLabel =
      invoice.internal_number ??
      invoice.ksef_number ??
      'bez numeru';

    const variables = {
      numerFaktury: invoiceLabel,
      kwota: formatPln(Number(invoice.gross_total ?? 0)),
      kwotaDoZaplaty: formatPln(amountDue),
      dataWystawienia: formatDatePl(invoice.issue_date),
      terminPlatnosci: invoice.payment_due_date
        ? formatDatePl(invoice.payment_due_date)
        : '—',
      dniPoTerminie: daysOverdue,
      nazwaFirmy: tenant.name,
      nazwaKontrahenta: buyer?.name ?? '',
      rachunekBankowy: readBankAccountFromPayment(invoice.payment_data),
      imieNadawcy: settings?.sender_name?.trim() || tenant.name,
    };

    const resolved = resolveTemplate(templateSource, variables);

    const pdfPath = await step.run('persist-demand-letter-pdf', async () => {
      if (!isReminderStagePdf(reminder.stage)) return null;

      const buf = await generateDemandLetterPdf({
        sellerName: tenant.name,
        sellerNip: tenant.nip,
        sellerAddress: formatAddressJson(tenant.address_json),
        buyerName: buyer?.name ?? '',
        buyerNip: buyer?.nip ?? invoice.buyer_nip ?? undefined,
        buyerAddress: formatBuyerAddressLines(buyer?.address),
        invoiceNumber: invoiceLabel,
        issueDate: invoice.issue_date,
        dueDate: invoice.payment_due_date ?? invoice.issue_date,
        grossAmount: Number(invoice.gross_total ?? 0),
        paidAmount: Number(invoice.paid_amount ?? 0),
        amountDue,
        bankAccount: readBankAccountFromPayment(invoice.payment_data),
        daysOverdue,
        senderName: settings?.sender_name?.trim() || tenant.name,
        senderEmail:
          settings?.reply_to_email?.trim() ??
          `kontakt@${getDomainFromTenant()}`,
        placeOfIssue: extractCityFromAddressJson(tenant.address_json),
        letterDate: new Date().toISOString().slice(0, 10),
      });

      const path = `reminders/${reminder.tenant_id}/${reminder.id}.pdf`;
      await uploadToR2(path, buf, 'application/pdf');
      return path;
    });

    const emailResult = await step.run('send-email', async () => {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey || apiKey.startsWith('re_xxxx')) {
        throw new NonRetriableError('RESEND nie skonfigurowany — brak klucza');
      }

      const resend = new Resend(apiKey);

      const buyerEmail = buyer?.email?.trim();
      if (!buyerEmail) {
        throw new NonRetriableError('Brak emaila kontrahenta');
      }

      const fromEmail =
        settings?.sender_email?.trim() ??
        process.env.RESEND_FROM_EMAIL?.trim() ??
        '';

      if (!fromEmail) {
        throw new NonRetriableError(
          'Brak nadawcy: ustaw sender_email w reminder_settings lub RESEND_FROM_EMAIL',
        );
      }

      const fromName = settings?.sender_name?.trim() ?? tenant.name;

      let attachmentBuffer: Buffer | null = null;
      if (pdfPath) {
        attachmentBuffer = await downloadFromR2(pdfPath);
      }

      const safeInvoiceFile = invoiceLabel.replace(/\//g, '-');
      const attachments = attachmentBuffer
        ? [
            {
              filename: `Wezwanie-${safeInvoiceFile}.pdf`,
              content: attachmentBuffer,
            },
          ]
        : undefined;

      const to = DEV_TO_OVERRIDE ?? buyerEmail;
      const subject = DEV_TO_OVERRIDE
        ? `[DEV → ${buyerEmail}] ${resolved.subject}`
        : resolved.subject;

      const result = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to,
        replyTo: settings?.reply_to_email ?? undefined,
        subject,
        html: resolved.bodyHtml,
        text: resolved.bodyText,
        attachments,
      });

      if (result.error) {
        throw new Error(`Resend error: ${result.error.message}`);
      }

      return { messageId: result.data?.id };
    });

    await step.run('mark-sent', async () => {
      const { error } = await supabase
        .from('payment_reminders')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          email_message_id: emailResult.messageId ?? null,
          email_subject: resolved.subject,
          email_body: resolved.bodyText,
          pdf_attachment_path: pdfPath,
          days_overdue_at_send: daysOverdue,
        })
        .eq('id', reminderId);
      if (error) throw new Error(error.message);
    });

    return {
      success: true as const,
      stage: reminder.stage,
      messageId: emailResult.messageId,
      hasPdf: !!pdfPath,
    };
  },
);

// ============================================================================
// Helpers
// ============================================================================

interface BuyerPartySnippet {
  name?: string;
  email?: string;
  nip?: string;
  address?: {
    addressLine1?: string;
    addressLine2?: string;
  };
}

function readBuyerParty(json: Json | null): BuyerPartySnippet | null {
  if (!json || typeof json !== 'object') return null;
  const b = json as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name : undefined;
  const email = typeof b.email === 'string' ? b.email : undefined;
  const nipVal = typeof b.nip === 'string' ? b.nip : undefined;
  const addrRaw = b.address;
  let address: BuyerPartySnippet['address'];
  if (addrRaw && typeof addrRaw === 'object' && addrRaw !== null) {
    const a = addrRaw as Record<string, unknown>;
    address = {
      addressLine1:
        typeof a.addressLine1 === 'string' ? a.addressLine1 : undefined,
      addressLine2:
        typeof a.addressLine2 === 'string' ? a.addressLine2 : undefined,
    };
  }
  return { name, email, nip: nipVal, address };
}

function readBankAccountFromPayment(paymentData: Json | null): string {
  if (!paymentData || typeof paymentData !== 'object') return '';
  const p = paymentData as { bankAccount?: string };
  return (p.bankAccount ?? '').trim();
}

function formatAddressJson(address: Json | null): string {
  if (!address) return '';
  if (typeof address === 'string') return address;
  const a = address as { addressLine1?: string; addressLine2?: string };
  return [a.addressLine1, a.addressLine2].filter(Boolean).join(', ');
}

function formatBuyerAddressLines(
  address: BuyerPartySnippet['address'] | undefined,
): string {
  if (!address) return '';
  return [address.addressLine1, address.addressLine2]
    .filter(Boolean)
    .join(', ');
}

function extractCityFromAddressJson(address: Json | null): string {
  if (!address) return 'Polska';
  let line2: string | undefined;
  if (typeof address === 'string') {
    line2 = address;
  } else {
    const a = address as { addressLine2?: string };
    line2 = a.addressLine2;
  }
  if (!line2) return 'Polska';
  const match = line2.match(/\d{2}-\d{3}\s+(.+)/);
  return match?.[1]?.trim() ?? line2;
}

function getDomainFromTenant(): string {
  return (
    process.env.NEXT_PUBLIC_APP_DOMAIN?.replace(/^https?:\/\//, '').replace(
      /\/.*$/,
      '',
    ) ?? DEFAULT_FALLBACK_DOMAIN
  );
}

function calendarDaysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const due = parseDateUtcMidnight(dueDate);
  if (!due) return 0;
  const today = new Date();
  const t0 = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.floor((t0 - due.getTime()) / 86400000);
}

function parseDateUtcMidnight(isoDate: string): Date | null {
  const day = isoDate.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
