'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { createClient } from '@/lib/supabase/server';
import { downloadInvoiceXml } from '@/lib/storage/r2';
import { inngest } from '@/lib/inngest/client';
import { formatInngestSendError } from '@/lib/inngest/error-message';
import type {
  Address,
  BuyerParty,
  Invoice,
  InvoiceLineItem,
  PaymentInfo,
  SellerParty,
  VatRate,
} from '@/types/invoice';

// ═══════════════════════════════════════════════════════════════
// downloadInvoiceXmlAction
// ═══════════════════════════════════════════════════════════════

export type DownloadXmlResult =
  | { success: true; xml: string; filename: string }
  | { success: false; error: string };

/**
 * Pobiera XML faktury z R2 i oddaje jego treść do klienta (Blob → <a download>).
 *
 * Bezpieczeństwo: routing przez zwykły `createClient()` (z RLS) -
 * user dostanie `invoices` tylko swojego tenanta. `xml_documents` też
 * ma RLS (przez tenant_id), więc odczyt hasha jest bezpieczny.
 *
 * Weryfikujemy SHA-256 z `xml_documents` - niezgodność oznaczałaby
 * korupcję plików w R2 (lub rozjazd DB↔R2), wtedy zwracamy błąd
 * zamiast podawać uszkodzony plik.
 */
export async function downloadInvoiceXmlAction(
  invoiceId: string
): Promise<DownloadXmlResult> {
  try {
    const supabase = await createClient();

    const { data: inv, error: invErr } = await supabase
      .from('invoices')
      .select('internal_number, xml_storage_path, tenant_id')
      .eq('id', invoiceId)
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
      xmlDoc.sha256_hash
    );

    const safeName = (inv.internal_number ?? invoiceId).replace(
      /[^a-zA-Z0-9_-]+/g,
      '-'
    );

    const {
      data: { user: dlUser },
    } = await supabase.auth.getUser();
    const tenantId = inv.tenant_id as string | null | undefined;
    if (dlUser && tenantId) {
      await logAudit({
        action: 'invoice.xml_downloaded',
        tenantId,
        userId: dlUser.id,
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: { internalNumber: inv.internal_number },
      });
    }

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
  | { success: false; error: string };

/**
 * Ponawia wysyłkę faktury do KSeF. Działa tylko dla statusów
 * 'rejected' i 'failed' (status guard po stronie UI - `InvoiceActions`).
 *
 * Odtwarzamy pełny obiekt `Invoice` z DB (snapshot w `fa3_data` lub
 * rekonstrukcja z `seller_data/buyer_data/payment_data` + line_items),
 * resetujemy status na 'queued' i publikujemy event `invoice/submit.requested`.
 * Dalszy flow taki sam jak przy pierwszej wysyłce.
 */
export async function resendInvoiceAction(
  invoiceId: string
): Promise<ResendResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Brak sesji' };

    const { data: inv, error } = await supabase
      .from('invoices')
      .select(
        `
        id,
        tenant_id,
        internal_number,
        invoice_type,
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
        invoice_line_items(
          ordinal,
          name,
          unit,
          quantity,
          unit_price_net,
          vat_rate,
          net_amount,
          vat_amount,
          gross_amount
        ),
        tenants(nip, ksef_credentials_encrypted)
      `
      )
      .eq('id', invoiceId)
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

    // Preferujemy `fa3_data` (pełny snapshot zapisany przy save), a line-items
    // tak czy inaczej ciągniemy z relacji na wypadek edycji pozycji w szkicu.
    const snapshot = (inv.fa3_data as Invoice | null) ?? null;

    const rawLines = (inv.invoice_line_items ?? []) as Array<{
      ordinal: number;
      name: string;
      unit: string;
      quantity: string | number;
      unit_price_net: string | number;
      vat_rate: string;
      net_amount: string | number;
      vat_amount: string | number;
      gross_amount: string | number;
    }>;

    const lines: InvoiceLineItem[] = rawLines
      .slice()
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((l) => ({
        ordinal: l.ordinal,
        name: l.name,
        unit: l.unit,
        quantity: Number(l.quantity),
        unitPriceNet: Number(l.unit_price_net),
        netAmount: Number(l.net_amount),
        vatRate: l.vat_rate as VatRate,
        vatAmount: Number(l.vat_amount),
        grossAmount: Number(l.gross_amount),
      }));

    const seller = (inv.seller_data ?? snapshot?.seller) as SellerParty | undefined;
    const buyer = (inv.buyer_data ?? snapshot?.buyer) as BuyerParty | undefined;
    const payment = (inv.payment_data ?? snapshot?.payment) as
      | PaymentInfo
      | undefined;

    if (!seller || !buyer || !payment) {
      return {
        success: false,
        error: 'Uszkodzony snapshot faktury - brak danych sprzedawcy/nabywcy/płatności.',
      };
    }

    // Gwarantujemy wymagane pole address (SellerParty/BuyerParty typy).
    const ensureAddress = (addr: Address | null | undefined): Address => ({
      countryCode: addr?.countryCode ?? 'PL',
      addressLine1: addr?.addressLine1 ?? '',
      addressLine2: addr?.addressLine2 ?? '',
    });

    const rebuiltInvoice: Invoice = {
      internalNumber: (inv.internal_number as string | null) ?? snapshot?.internalNumber ?? '',
      type:
        (inv.invoice_type as Invoice['type'] | null) ??
        snapshot?.type ??
        'VAT',
      issueDate:
        (inv.issue_date as string | null) ?? snapshot?.issueDate ?? '',
      saleDate:
        (inv.sale_date as string | null) ?? snapshot?.saleDate ?? undefined,
      seller: {
        ...seller,
        address: ensureAddress(seller.address),
      },
      buyer: {
        ...buyer,
        address: ensureAddress(buyer.address),
      },
      lines,
      netTotal: Number(inv.net_total ?? snapshot?.netTotal ?? 0),
      vatTotal: Number(inv.vat_total ?? snapshot?.vatTotal ?? 0),
      grossTotal: Number(inv.gross_total ?? snapshot?.grossTotal ?? 0),
      payment,
      notes: (inv.notes as string | null) ?? snapshot?.notes ?? undefined,
    };

    await inngest.send({
      name: 'invoice/submit.requested',
      data: {
        tenantId: inv.tenant_id as string,
        invoiceId,
        invoice: rebuiltInvoice,
        nip: tenantNip,
      },
    });

    const { error: updErr } = await supabase
      .from('invoices')
      .update({
        ksef_status: 'queued',
        last_error: null,
      })
      .eq('id', invoiceId);

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
    return {
      success: false,
      error:
        err instanceof Error
          ? formatInngestSendError(err)
          : 'Błąd ponownej wysyłki',
    };
  }
}
