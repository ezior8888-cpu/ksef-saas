'use server';

import { isDeepStrictEqual } from 'node:util';
import { revalidatePath } from 'next/cache';
import { sendJobEvent } from '@/lib/jobs/enqueue';

import { logAudit } from '@/lib/audit/log';
import {
  KsefNotVerifiedError,
  requireKsefVerification,
} from '@/lib/auth/ksef-verification-guard';
import { ActionAuthError, requireUserAndActiveOrg } from '@/lib/supabase/auth-context';
import { downloadInvoiceXml } from '@/lib/storage/r2';
import { specialInvoiceResendMessage } from '@/lib/ksef/special-invoice-data';
import { formatInngestSendError } from '@/lib/inngest/error-message';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf';
import { loadInvoiceForPdf } from '@/lib/pdf/invoice-data';
import { sendInvoiceEmail } from '@/lib/email/send';
import type { Invoice } from '@/types/invoice';

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
 * Ponawia wysyłkę faktury do KSeF. Działa tylko dla statusów
 * 'rejected' i 'failed' (status guard po stronie UI - `InvoiceActions`).
 *
 * Wysyłamy dokładny snapshot `fa3_data` po sprawdzeniu kolumn nagłówka,
 * resetujemy status na 'queued' i publikujemy event `invoice/submit.requested`.
 * Dalszy flow taki sam jak przy pierwszej wysyłce.
 */
export async function resendInvoiceAction(
  invoiceId: string
): Promise<ResendResult> {
  try {
    // Server Actions are callable directly: verify MFA and live membership
    // before reading the invoice or publishing another KSeF job.
    const { supabase, user, tenantId } = await requireUserAndActiveOrg();

    const { data: inv, error } = await supabase
      .from('invoices')
      .select(
        `
        id,
        tenant_id,
        internal_number,
        invoice_type,
        invoice_kind,
        issue_date,
        sale_date,
        seller_data,
        buyer_data,
        payment_data,
        notes,
        net_total,
        vat_total,
        gross_total,
        ksef_status,
        fa3_data,
        tenants(nip, ksef_credentials_encrypted)
      `
      )
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !inv) {
      return { success: false, error: error?.message ?? 'Faktura nie istnieje' };
    }

    if (inv.ksef_status !== 'rejected' && inv.ksef_status !== 'failed') {
      return {
        success: false,
        error: 'Ponowną wysyłkę można uruchomić tylko dla odrzuconych/błędnych faktur.',
      };
    }
    // This path rebuilds only the ordinary VAT payload. Replaying KOR/ZAL/ROZ
    // here would silently emit a different legal document than the original.
    if (inv.invoice_kind !== 'regular') {
      return {
        success: false,
        error: 'Ponowna wysyłka tego typu faktury wymaga ręcznego uzgodnienia i dedykowanej ścieżki.',
      };
    }

    // Korekta/zaliczka/rozliczenie potrzebują danych, których nie ma w bazie
    // (patrz lib/ksef/special-invoice-data.ts). Mówimy od razu, zamiast
    // przestawiać status na 'queued' dla joba, który i tak odmówi.
    const storedType = inv.invoice_type as string | null;
    const payloadType = (inv.fa3_data as Invoice | null)?.type;
    const specialMessage = specialInvoiceResendMessage(storedType) ??
      specialInvoiceResendMessage(payloadType);
    if (specialMessage) {
      return { success: false, error: specialMessage };
    }
    if ((storedType !== 'VAT' && storedType !== 'UPR') || payloadType !== storedType) {
      return {
        success: false,
        error: 'Typ faktury w bazie i kopii XML jest niespójny; wymagane ręczne uzgodnienie.',
      };
    }
    // The legal XML can contain line attributes absent from invoice_line_items
    // (for example classificationCode). Rebuilding it would change the legal
    // document while still reporting the resend as queued.
    const snapshot = inv.fa3_data as Invoice | null;
    if (!snapshot || !Array.isArray(snapshot.lines) || !snapshot.lines.length ||
        !snapshot.seller || !snapshot.buyer || !snapshot.payment ||
        snapshot.internalNumber !== inv.internal_number ||
        snapshot.issueDate !== inv.issue_date ||
        (snapshot.saleDate ?? null) !== (inv.sale_date ?? null) ||
        !isDeepStrictEqual(snapshot.seller, inv.seller_data) ||
        !isDeepStrictEqual(snapshot.buyer, inv.buyer_data) ||
        !isDeepStrictEqual(snapshot.payment, inv.payment_data) ||
        inv.net_total == null || inv.vat_total == null || inv.gross_total == null ||
        snapshot.netTotal !== Number(inv.net_total) ||
        snapshot.vatTotal !== Number(inv.vat_total) ||
        snapshot.grossTotal !== Number(inv.gross_total) ||
        (snapshot.notes ?? null) !== (inv.notes ?? null)) {
      return {
        success: false,
        error: 'Kopia faktury i zapisane dane są niekompletne lub niespójne; wymagane ręczne uzgodnienie.',
      };
    }

    const tenantRow = Array.isArray(inv.tenants) ? inv.tenants[0] : inv.tenants;
    const tenantNip = (tenantRow?.nip as string | undefined) ?? '';
    if (!tenantNip) {
      return { success: false, error: 'Brak NIP tenanta (kontekst jobu)' };
    }

    if (!tenantRow?.ksef_credentials_encrypted) {
      return {
        success: false,
        error:
          'Najpierw wgraj certyfikat KSeF w Ustawienia KSeF — bez niego ponowna wysyłka nie jest możliwa.',
      };
    }

    try {
      await requireKsefVerification(inv.tenant_id as string);
    } catch (e) {
      if (e instanceof KsefNotVerifiedError) {
        return {
          success: false,
          code: 'KSEF_NOT_VERIFIED',
          error:
            'Twoja organizacja musi najpierw zweryfikować certyfikat KSeF w Ustawieniach → KSeF.',
        };
      }
      throw e;
    }

    await sendJobEvent({
      groupId: inv.tenant_id as string,
      name: 'invoice/submit.requested',
      data: {
        tenantId: inv.tenant_id as string,
        invoiceId,
        invoice: snapshot,
        nip: tenantNip,
        environment: requireConfiguredKsefEnvironment(),
      },
    });

    const { error: updErr } = await supabase
      .from('invoices')
      .update({
        ksef_status: 'queued',
        last_error: null,
        last_error_code: null,
        last_error_field: null,
        last_error_suggestion: null,
      })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId);

    if (updErr) {
      console.error('[resendInvoiceAction] queued update failed', updErr);
    }

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${invoiceId}`);

    await logAudit({
      action: 'invoice.resubmit_requested',
      tenantId: inv.tenant_id as string,
      userId: user.id,
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: { internalNumber: inv.internal_number },
    });

    return { success: true };
  } catch (err) {
    if (err instanceof ActionAuthError) {
      return { success: false, error: err.message };
    }
    if (err instanceof KsefNotVerifiedError) {
      return {
        success: false,
        code: 'KSEF_NOT_VERIFIED',
        error:
          'Twoja organizacja musi najpierw zweryfikować certyfikat KSeF w Ustawieniach → KSeF.',
      };
    }
    return {
      success: false,
      error:
        err instanceof Error
          ? formatInngestSendError(err)
          : 'Błąd ponownej wysyłki',
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

  const pdfResult = await generateInvoicePdf(invoiceId, tenantId);
  if (!pdfResult.success) {
    return { success: false, error: pdfResult.error };
  }

  const data = await loadInvoiceForPdf(invoiceId, tenantId);
  if (!data || data.tenantId !== tenantId) {
    return { success: false, error: 'Faktura nie istnieje.' };
  }

  const inv = data.invoice;
  const send = await sendInvoiceEmail({
    to: email,
    invoiceNumber: inv.internalNumber,
    sellerName: inv.seller.name,
    grossTotalLabel: `${inv.grossTotal.toLocaleString('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} PLN`,
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
