'use server';

import { logAudit } from '@/lib/audit/log';
import { ActionAuthError, requireUserAndActiveOrg } from '@/lib/supabase/auth-context';
import { downloadInvoiceXml } from '@/lib/storage/r2';
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf';
import { loadInvoiceForPdf } from '@/lib/pdf/invoice-data';
import { invoiceEmailAmount } from '@/lib/email/invoice-email-amount';
import { sendInvoiceEmail } from '@/lib/email/send';
import { checkRateLimit } from '@/lib/rate-limit';

// ═══════════════════════════════════════════════════════════════
// downloadInvoiceXmlAction
// ═══════════════════════════════════════════════════════════════

export type DownloadXmlResult =
  | { success: true; xml: string; filename: string }
  | { success: false; error: string };

/**
 * Pobiera XML faktury z R2 i oddaje jego treść do klienta (Blob → <a download>).
 *
 * Bezpieczeństwo: wymagamy zweryfikowanej sesji MFA i aktywnego członkostwa,
 * a odczyt przez RLS dodatkowo zawężamy do aktywnej organizacji.
 *
 * Weryfikujemy SHA-256 z `xml_documents` - niezgodność oznaczałaby
 * korupcję plików w R2 (lub rozjazd DB↔R2), wtedy zwracamy błąd
 * zamiast podawać uszkodzony plik.
 */
export async function downloadInvoiceXmlAction(
  invoiceId: string
): Promise<DownloadXmlResult> {
  try {
    const { supabase, user, tenantId } = await requireUserAndActiveOrg();

    const { data: inv, error: invErr } = await supabase
      .from('invoices')
      .select('internal_number, xml_storage_path, tenant_id')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (invErr) return { success: false, error: invErr.message };
    if (!inv?.xml_storage_path) {
      return {
        success: false,
        error: 'Brak pliku XML - faktura nie została jeszcze wysłana do KSeF.',
      };
    }

    const { data: xmlDoc, error: xmlErr } = await supabase
      .from('xml_documents')
      .select('sha256_hash')
      .eq('storage_path', inv.xml_storage_path)
      .eq('tenant_id', inv.tenant_id)
      .eq('invoice_id', invoiceId)
      .maybeSingle();

    if (xmlErr) return { success: false, error: xmlErr.message };
    if (!xmlDoc?.sha256_hash) {
      return {
        success: false,
        error: 'Brak rekordu xml_documents dla tej faktury (re-sync wymagany).',
      };
    }

    const xml = await downloadInvoiceXml(
      inv.xml_storage_path,
      xmlDoc.sha256_hash,
      inv.tenant_id,
    );

    const safeName = (inv.internal_number ?? invoiceId).replace(
      /[^a-zA-Z0-9_-]+/g,
      '-'
    );

    await logAudit({
      action: 'invoice.xml_downloaded',
      tenantId,
      userId: user.id,
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: { internalNumber: inv.internal_number },
    });

    return {
      success: true,
      xml,
      filename: `${safeName}.xml`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Błąd pobierania XML',
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// resendInvoiceAction
// ═══════════════════════════════════════════════════════════════

export type ResendResult =
  | { success: true }
  | { success: false; error: string; code?: 'KSEF_NOT_VERIFIED' };

/**
 * Historical failed/rejected rows do not prove whether an earlier KSeF POST
 * succeeded. Until a durable per-attempt identity and operator reconciliation
 * flow exists, even a null submitted_to_ksef_at is not evidence for safe replay.
 */
export async function resendInvoiceAction(
  invoiceId: string
): Promise<ResendResult> {
  try {
    const { supabase, tenantId } = await requireUserAndActiveOrg();
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('ksef_status')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !invoice) {
      return { success: false, error: 'Nie można znaleźć faktury w tej organizacji.' };
    }
    if (invoice.ksef_status !== 'rejected' && invoice.ksef_status !== 'failed') {
      return {
        success: false,
        error: 'Ponowną wysyłkę można uruchomić tylko dla odrzuconych/błędnych faktur.',
      };
    }

    return {
      success: false,
      error: 'Automatyczna ponowna wysyłka jest wstrzymana. Najpierw trzeba ręcznie uzgodnić fakturę z KSeF.',
    };
  } catch (err) {
    if (err instanceof ActionAuthError) {
      return { success: false, error: err.message };
    }
    return {
      success: false,
      error: 'Nie można sprawdzić możliwości ponownej wysyłki. Spróbuj później.',
    };
  }
}
// ═══════════════════════════════════════════════════════════════
// emailInvoiceAction — wysyłka faktury do nabywcy z PDF (Faza 33 Krok 8)
// ═══════════════════════════════════════════════════════════════

export type EmailInvoiceResult =
  | { success: true }
  | { success: false; error: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Ile faktur firma może wysłać mailem w godzinie (AUD-102). */
const INVOICE_EMAILS_PER_HOUR = 30;

export async function emailInvoiceAction(
  invoiceId: string,
  recipientEmail: string,
): Promise<EmailInvoiceResult> {
  const email = recipientEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { success: false, error: 'Nieprawidłowy adres email.' };
  }

  let context: Awaited<ReturnType<typeof requireUserAndActiveOrg>>;
  try {
    // PDF uses a service-role loader, so the tenant must come from live
    // membership verification, never from the caller-controlled org cookie.
    context = await requireUserAndActiveOrg();
  } catch (err) {
    if (err instanceof ActionAuthError) {
      return { success: false, error: err.message };
    }
    throw err;
  }
  const { user, tenantId } = context;

  // Limit na firmę PRZED generowaniem PDF (AUD-102): wysyłka idzie z domeny
  // FaktFlow na dowolny adres. Limit w pamięci procesu przy braku Redisa
  // wystarcza — jedna instancja aplikacji.
  const quota = await checkRateLimit({
    bucket: 'invoice_email',
    identifier: tenantId,
    limit: INVOICE_EMAILS_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!quota.allowed) {
    return {
      success: false,
      error: `Osiągnięto limit ${INVOICE_EMAILS_PER_HOUR} wysyłek faktur mailem na godzinę. Spróbuj później.`,
    };
  }

  const pdfResult = await generateInvoicePdf(invoiceId, tenantId);
  if (!pdfResult.success) {
    return { success: false, error: pdfResult.error };
  }

  const data = await loadInvoiceForPdf(invoiceId, tenantId);
  if (!data || data.tenantId !== tenantId) {
    return { success: false, error: 'Faktura nie istnieje.' };
  }

  const inv = data.invoice;
  const amount = invoiceEmailAmount(inv);
  const send = await sendInvoiceEmail({
    to: email,
    invoiceNumber: inv.internalNumber,
    sellerName: inv.seller.name,
    amountCaption: amount.caption,
    amountLabel: amount.label,
    dueDate: inv.payment.dueDate,
    pdf: pdfResult.pdf,
    pdfFilename: pdfResult.filename,
  });

  if (!send.sent) {
    return {
      success: false,
      error:
        send.reason === 'not-configured'
          ? 'Wysyłka email nie jest skonfigurowana.'
          : 'Nie udało się wysłać wiadomości.',
    };
  }

  await logAudit({
    action: 'invoice.emailed',
    tenantId,
    userId: user.id,
    entityType: 'invoice',
    entityId: invoiceId,
    metadata: { recipient: email },
  });

  return { success: true };
}
