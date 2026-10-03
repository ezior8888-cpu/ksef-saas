'use server';

import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { enqueueKsefSubmitAfterDraft } from '@/lib/invoices/ksef-submit-enqueue';
import {
  canManageKsefSend,
  decideResend,
  describeResetError,
  KSEF_SEND_MESSAGES,
} from '@/lib/invoices/ksef-send-policy';
import { createAdminClient } from '@/lib/supabase/admin';
import { ActionAuthError, requireOrgRole, requireUserAndActiveOrg } from '@/lib/supabase/auth-context';
import { downloadInvoiceXml } from '@/lib/storage/r2';
import { validateInvoice } from '@/lib/xml/invoice-calculator';
import type { Invoice } from '@/types/invoice';
import { generateInvoicePdf, verifyInvoicePdfDeliveryState } from '@/lib/pdf/invoice-pdf';
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
  | { success: false; error: string; code?: 'KSEF_NOT_VERIFIED' | 'MFA_REQUIRED' };

interface ResendRow {
  ksef_status: string | null;
  direction: string | null;
  invoice_kind: string | null;
  invoice_type: string | null;
  last_error_code: string | null;
  fa3_data: unknown;
}

/**
 * „Wyślij ponownie” (cykl życia faktury, PR 3b — K3): `failed → queued` przez
 * RPC `requeue_ksef_send` w jednej transakcji ze zleceniem pg-boss. Kto i kiedy:
 * `lib/invoices/ksef-send-policy.ts` (właściciel/admin — D4; `rejected` nigdy,
 * wraca do szkicu — D2; klasy terminal/hold/reconcile nie). Runner i tak
 * zaczyna od uzgodnienia po referencji, więc historyczny `failed` bez kodu
 * nie wysyła faktury drugi raz, jeśli KSeF ją ma.
 */
export async function resendInvoiceAction(
  invoiceId: string
): Promise<ResendResult> {
  try {
    const { supabase, user, tenantId, role } = await requireUserAndActiveOrg();
    if (!canManageKsefSend(role)) {
      return { success: false, error: KSEF_SEND_MESSAGES.role };
    }
    const { data, error } = await supabase
      .from('invoices')
      .select('ksef_status, direction, invoice_kind, invoice_type, last_error_code, fa3_data')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: KSEF_SEND_MESSAGES.notFound };
    }
    const row = data as ResendRow;
    const decision = decideResend({
      direction: row.direction,
      status: row.ksef_status,
      errorCode: row.last_error_code,
      invoiceKind: row.invoice_kind,
    });
    if (!decision.allowed) {
      if (decision.reason === 'reconcile') {
        // Klient prosi o wysyłkę faktury „do uzgodnienia” — operator ma to zobaczyć.
        Sentry.captureMessage('Klient prosi o ponowną wysyłkę faktury wymagającej uzgodnienia', {
          level: 'warning',
          tags: { area: 'ksef.resend' },
          extra: { tenantId, invoiceId, code: row.last_error_code },
        });
      }
      return { success: false, error: decision.message };
    }

    const invoice = row.fa3_data as Invoice | null;
    if (!invoice || typeof invoice !== 'object' || !Array.isArray(invoice.lines)) {
      return { success: false, error: KSEF_SEND_MESSAGES.incomplete };
    }
    const problems = validateInvoice(invoice);
    if (problems.length > 0) {
      return { success: false, error: problems[0]! };
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('nip')
      .eq('id', tenantId)
      .maybeSingle();
    const nip = (tenant?.nip as string | null | undefined) ?? invoice.seller?.nip;
    if (!nip) return { success: false, error: 'Brak NIP firmy.' };

    const enq = await enqueueKsefSubmitAfterDraft({
      supabase,
      tenantId,
      userId: user.id,
      invoiceId,
      nip,
      invoice,
      auditKind: 'regular',
      internalNumberForAudit: invoice.internalNumber,
      mode: { kind: 'requeue', actorUserId: user.id },
    });
    if (!enq.ok) {
      return enq.code
        ? { success: false, error: enq.error, code: enq.code }
        : { success: false, error: enq.error };
    }

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${invoiceId}`);
    return { success: true };
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
// resetInvoiceToDraftAction
// ═══════════════════════════════════════════════════════════════

export type ResetToDraftResult =
  | { success: true }
  | { success: false; error: string };

/**
 * „Wróć do szkicu” (PR 3b, decyzja D2): `failed`/`rejected → draft` przez RPC
 * `reset_ksef_send` (00131). RPC odmawia, gdy faktura ma dowód kontaktu
 * z KSeF (numer KSeF albo wpis `sent`/`accepted`/`duplicate`) albo kod klasy
 * reconcile — wtedy sprawą zajmuje się operator. Klucz serwisowy, bo
 * przejścia stanu są serwerowe (RPC przepuszczają tylko service_role);
 * firma i rola pochodzą z sesji (`requireOrgRole`).
 */
export async function resetInvoiceToDraftAction(
  invoiceId: string
): Promise<ResetToDraftResult> {
  try {
    const { user, tenantId } = await requireOrgRole(['owner', 'admin']);
    const { error } = await createAdminClient().rpc('reset_ksef_send', {
      p_invoice_id: invoiceId,
      p_tenant_id: tenantId,
      p_actor_user_id: user.id,
    });
    if (error) {
      return { success: false, error: describeResetError(error) };
    }
    revalidatePath('/invoices');
    revalidatePath(`/invoices/${invoiceId}`);
    return { success: true };
  } catch (err) {
    if (err instanceof ActionAuthError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: KSEF_SEND_MESSAGES.resetFailed };
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
  // B14: podgląd bez KODU I nie jest wizualizacją faktury dla nabywcy.
  if (pdfResult.missingKodI) {
    return {
      success: false,
      error: 'Nie wysyłamy tej faktury mailem: brak kodu QR KSeF (aplikacja nie ma zapisanego pliku XML). Nabywca znajdzie fakturę w KSeF.',
    };
  }

  const data = await loadInvoiceForPdf(invoiceId, tenantId);
  if (!data || data.tenantId !== tenantId) {
    return { success: false, error: 'Faktura nie istnieje.' };
  }

  const inv = data.invoice;
  const amount = invoiceEmailAmount(inv);
  const deliveryFailure = await verifyInvoicePdfDeliveryState(invoiceId, tenantId, pdfResult.qrStateKey);
  if (deliveryFailure) {
    return { success: false, error: deliveryFailure.error };
  }
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
