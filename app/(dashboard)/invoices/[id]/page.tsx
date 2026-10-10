import { notFound } from 'next/navigation';

import { KSEF_RESEND_SOURCE_COLUMNS, ksefResendFacts } from '@/lib/invoices/ksef-requeue-event';
import { canManageKsefSend } from '@/lib/invoices/ksef-send-policy';
import { configuredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { describeDuplicateOriginal, parseDuplicateCheck } from '@/lib/ksef/duplicate-check';
import {
  duplicateDecisionOptions,
  duplicateMarker,
  retiredDraftView,
  type DuplicateDecisionInvoiceRow,
  type DuplicateDecisionView,
  type RetiredDraftView,
} from '@/lib/ksef/duplicate-decision';
import { loadDuplicateDecisionFacts } from '@/lib/ksef/duplicate-decision-facts';
import { createClient } from '@/lib/supabase/server';
import {
  InvoiceDetailView,
  type InvoiceDetailInitial,
  type InvoiceDetailLine,
} from '@/components/invoices/invoice-detail-view';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      `
      id,
      tenant_id,
      internal_number,
      invoice_type,
      ${KSEF_RESEND_SOURCE_COLUMNS},
      sale_date,
      direction,
      ksef_status,
      ksef_number,
      ksef_accepted_at,
      xml_storage_path,
      net_total,
      vat_total,
      gross_total,
      currency,
      paid_amount,
      stripe_invoice_id,
      offline_idempotency_key,
      offline_qr_offline,
      offline_qr_certyfikat,
      notes,
      last_error,
      last_error_code,
      last_error_field,
      last_error_suggestion,
      seller_data,
      buyer_nip,
      buyer_data,
      payment_data,
      invoice_line_items(
        ordinal,
        name,
        unit,
        quantity,
        unit_price_net,
        vat_rate,
        gross_amount
      )
      `
    )
    .eq('id', id)
    .maybeSingle();

  if (!invoice) notFound();
  const env = configuredKsefEnvironment();

  const { data: upo } = await supabase
    .from('upo_receipts')
    .select('status')
    .eq('invoice_id', id)
    .maybeSingle();

  // Rola w firmie TEJ faktury (nie z ciasteczka aktywnej firmy): decyduje
  // o przyciskach po błędzie wysyłki (PR 3b, D4). Akcje sprawdzają rolę
  // ponownie po swojej stronie — tu tylko to, co pokazać.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = user
    ? await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', invoice.tenant_id as string)
        .eq('status', 'active')
        .maybeSingle()
    : { data: null };

  const canManageSend = canManageKsefSend(membership?.role ?? null);
  const resendFacts = ksefResendFacts(invoice, env);
  const internalNumber = (invoice.internal_number as string | null) ?? null;

  // D-A4-1b-3 (00144, PR B 00148): KSeF ma już fakturę o tym numerze, a automat
  // nie rozstrzygnął — dane oryginału ze znacznika 440 i decyzja klienta; szkic
  // z wpisem `number_taken` jest wycofany (każdy rodzaj, decyzja 9). Fakty czyta
  // loader sesją (RLS), z wierszem faktury tej strony; błąd odczytu rzuca
  // (fail-closed — strona błędu z ponowieniem, nie panel bez danych).
  const awaitingDecision = invoice.ksef_status === 'failed' && invoice.last_error_code === 'KSEF_DUPLICATE_RECONCILE';
  const facts = awaitingDecision || invoice.ksef_status === 'draft'
    ? await loadDuplicateDecisionFacts(
        supabase,
        invoice.tenant_id as string,
        id,
        // Kolumny `DUPLICATE_DECISION_INVOICE_COLUMNS` są w odczycie wyżej; loader sprawdza każdą.
        invoice as unknown as DuplicateDecisionInvoiceRow,
      )
    : null;

  const duplicateDecision: DuplicateDecisionView | null = awaitingDecision && facts
    ? duplicateDecisionOptions({ facts, actor: 'client', canManage: canManageSend, environment: env, now: new Date() })
    : null;
  const marker = awaitingDecision && facts ? duplicateMarker(facts.submissions) : null;
  const original = marker?.original_ksef_number
    ? describeDuplicateOriginal(internalNumber, marker.original_ksef_number, parseDuplicateCheck(marker.original_check))
    : null;
  // Odmowa decyzji ma własny tekst (nazywa dokument i wyjście); `reason` zostawia notatkę PR A.
  const duplicateOriginal = original && duplicateDecision?.kind === 'refused' && duplicateDecision.message
    ? { ...original, note: duplicateDecision.message }
    : original;
  const retiredDraft: RetiredDraftView | null = invoice.ksef_status === 'draft' && facts
    ? retiredDraftView({
        invoiceNumber: internalNumber,
        invoiceKind: (invoice.invoice_kind as string | null) ?? null,
        submissions: facts.submissions,
        kindHeld: resendFacts.kindHeld,
      })
    : null;

  const lines = ((invoice.invoice_line_items ?? []) as InvoiceDetailLine[])
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal);

  const initial: InvoiceDetailInitial = {
    id: invoice.id as string,
    internal_number: internalNumber,
    invoice_type: (invoice.invoice_type as string | null) ?? null,
    invoice_kind: (invoice.invoice_kind as string | null) ?? null,
    issue_date: (invoice.issue_date as string | null) ?? null,
    sale_date: (invoice.sale_date as string | null) ?? null,
    ksef_status: invoice.ksef_status as string,
    ksef_number: (invoice.ksef_number as string | null) ?? null,
    ksef_accepted_at: (invoice.ksef_accepted_at as string | null) ?? null,
    xml_storage_path: (invoice.xml_storage_path as string | null) ?? null,
    net_total: invoice.net_total as string | number | null,
    vat_total: invoice.vat_total as string | number | null,
    gross_total: invoice.gross_total as string | number | null,
    notes: (invoice.notes as string | null) ?? null,
    last_error: (invoice.last_error as string | null) ?? null,
    last_error_code: (invoice.last_error_code as string | null) ?? null,
    last_error_field: (invoice.last_error_field as string | null) ?? null,
    last_error_suggestion: (invoice.last_error_suggestion as string | null) ?? null,
    seller_data: invoice.seller_data,
    buyer_data: invoice.buyer_data,
    payment_data: invoice.payment_data ?? null,
    lines,
    upo_status:
      upo?.status ??
      null,
    can_manage_send: canManageSend,
    // A4b PR2b: fakty ponowienia z kopii — dla każdego stanu (Realtime zmienia stan, nie fakty);
    // sama treść (fa3_data, special_data) nie trafia do komponentu klienckiego.
    ksef_resend_facts: resendFacts,
    ksef_environment_known: env !== null,
    ksef_duplicate_original: duplicateOriginal,
    // D-A4-1b-3 PR B: widoki liczone na serwerze — bez surowego `original_check`.
    ksef_duplicate_decision: duplicateDecision,
    ksef_retired_draft: retiredDraft,
  };

  return <InvoiceDetailView key={initial.id} initial={initial} />;
}
