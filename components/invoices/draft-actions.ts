'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import { enqueueKsefSubmitAfterDraft } from '@/lib/invoices/ksef-submit-enqueue';
import { ActionAuthError, requireUserAndActiveOrg } from '@/lib/supabase/auth-context';
import { validateInvoice } from '@/lib/xml/invoice-calculator';
import type { Invoice } from '@/types/invoice';

/**
 * Szkic faktury — wysyłka do KSeF i usunięcie (F-001 w raporcie audytu bloku 1).
 *
 * Do 02.10.2026 szkic był ślepą uliczką: kolejkę wysyłki wołały tylko akcje
 * tworzące nowy dokument, a szkicu nie dało się ani wysłać, ani usunąć —
 * jego numer zostawał zajęty (unikat numeru w organizacji), więc klient
 * wystawiał fakturę pod nowym numerem i zostawiał dziurę w serii.
 *
 * Wysyłka obejmuje tylko zwykłe faktury VAT: korekta, zaliczka i faktura
 * końcowa potrzebują danych specjalnych, których szkic nie przechowuje —
 * takie szkice można usunąć i wystawić ponownie.
 */

export type DraftActionResult =
  | { success: true; offline?: boolean }
  | { success: false; error: string };

interface DraftRow {
  id: string;
  ksef_status: string | null;
  direction: string | null;
  invoice_kind: string | null;
  invoice_type: string | null;
  internal_number: string | null;
  fa3_data: unknown;
}

const NOT_FOUND = 'Nie znaleziono faktury w tej organizacji.';

function authError(err: unknown): DraftActionResult | null {
  return err instanceof ActionAuthError ? { success: false, error: err.message } : null;
}

export async function sendDraftInvoiceAction(invoiceId: string): Promise<DraftActionResult> {
  try {
    const { supabase, user, tenantId } = await requireUserAndActiveOrg();

    const { data: row, error } = await supabase
      .from('invoices')
      .select('id, ksef_status, direction, invoice_kind, invoice_type, internal_number, fa3_data')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error || !row) return { success: false, error: NOT_FOUND };

    const draft = row as DraftRow;
    if (draft.ksef_status !== 'draft') {
      return { success: false, error: 'Do KSeF można wysłać tylko szkic.' };
    }
    const kind = draft.invoice_kind ?? 'regular';
    if (draft.direction !== 'outgoing' || kind !== 'regular' || (draft.invoice_type ?? 'VAT') !== 'VAT') {
      return {
        success: false,
        error: 'Ze szkicu można wysłać tylko zwykłą fakturę VAT. Korektę, zaliczkę i fakturę końcową usuń i wystaw ponownie.',
      };
    }

    const invoice = draft.fa3_data as Invoice | null;
    if (!invoice || typeof invoice !== 'object' || !Array.isArray(invoice.lines)) {
      return { success: false, error: 'Szkic nie ma kompletnych danych faktury. Usuń go i wystaw fakturę ponownie.' };
    }

    // Faktura w KSeF jest wystawiona w dniu przesłania (art. 106na ust. 1),
    // a KSeF odrzuca datę wystawienia późniejszą niż dzień przyjęcia i traktuje
    // wcześniejszą jak fakturę offline. Szkic z inną datą trzeba wystawić od nowa.
    const today = todayInWarsaw();
    if (invoice.issueDate !== today) {
      return {
        success: false,
        error: `Szkic ma datę wystawienia ${invoice.issueDate}, a fakturę w KSeF wystawia się w dniu wysyłki (${today}). Usuń szkic i wystaw fakturę ponownie z dzisiejszą datą.`,
      };
    }

    // Ta sama walidacja co w jobie wysyłki — błąd tutaj, zanim faktura
    // trafi do kolejki i wróci jako odrzucona.
    const errors = validateInvoice(invoice);
    if (errors.length > 0) {
      return { success: false, error: errors[0]! };
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('nip')
      .eq('id', tenantId)
      .maybeSingle();
    const nip = (tenant?.nip as string | null | undefined) ?? invoice.seller?.nip;
    if (!nip) return { success: false, error: 'Brak NIP firmy.' };

    // Atomowe przejęcie szkicu: podwójne kliknięcie albo druga karta nie
    // wyślą tej samej faktury dwa razy.
    const { data: claimed, error: claimError } = await supabase
      .from('invoices')
      .update({ ksef_status: 'queued' })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .eq('ksef_status', 'draft')
      .select('id');
    if (claimError) return { success: false, error: 'Nie udało się rozpocząć wysyłki. Spróbuj ponownie.' };
    if (!claimed || claimed.length === 0) {
      return { success: false, error: 'Ta faktura jest już wysyłana.' };
    }

    const enq = await enqueueKsefSubmitAfterDraft({
      supabase,
      tenantId,
      userId: user.id,
      invoiceId,
      nip,
      invoice,
      auditKind: 'regular',
      internalNumberForAudit: invoice.internalNumber,
    });

    if (!enq.ok) {
      // Kolejka odmówiła, zanim cokolwiek wysłała (brak certyfikatu, pauza
      // operatora, błąd kolejki) — faktura wraca do szkicu.
      await supabase
        .from('invoices')
        .update({ ksef_status: 'draft' })
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .eq('ksef_status', 'queued');
      return { success: false, error: enq.error };
    }

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${invoiceId}`);
    return { success: true, offline: enq.mode === 'offline_queued' };
  } catch (err) {
    return authError(err) ?? { success: false, error: 'Nie udało się wysłać szkicu. Spróbuj ponownie.' };
  }
}

export async function deleteDraftInvoiceAction(invoiceId: string): Promise<DraftActionResult> {
  try {
    const { supabase, user, tenantId } = await requireUserAndActiveOrg();

    // Pozycje znikają kaskadowo (invoice_line_items ON DELETE CASCADE).
    // Warunek na status w samym zapytaniu: szkic, który właśnie poszedł do
    // kolejki, nie zostanie usunięty.
    const { data: deleted, error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .eq('ksef_status', 'draft')
      .select('id, internal_number');
    if (error) return { success: false, error: 'Nie udało się usunąć szkicu. Spróbuj ponownie.' };
    if (!deleted || deleted.length === 0) {
      return { success: false, error: 'Usunąć można tylko szkic, który nie został wysłany do KSeF.' };
    }

    await logAudit({
      action: 'invoice.draft_deleted',
      tenantId,
      userId: user.id,
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: { internalNumber: (deleted[0] as { internal_number?: string | null }).internal_number ?? null },
    });

    revalidatePath('/invoices');
    return { success: true };
  } catch (err) {
    return authError(err) ?? { success: false, error: 'Nie udało się usunąć szkicu. Spróbuj ponownie.' };
  }
}
