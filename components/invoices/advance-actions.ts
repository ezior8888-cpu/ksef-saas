'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { logAudit } from '@/lib/audit/log';
import { enqueueKsefSubmitAfterDraft } from '@/lib/invoices/ksef-submit-enqueue';
import { createClient } from '@/lib/supabase/server';
import { formatInngestSendError } from '@/lib/inngest/error-message';
import { calculateAdvanceTotals } from '@/lib/invoices/calculator';
import {
  buyerPartyFromBuyerData,
  sellerPartyFromSellerData,
} from '@/lib/invoices/map-buyer-party';
import {
  advanceInvoiceSchema,
  type AdvanceInvoiceSchemaIn,
} from '@/lib/validators/invoice-validators';
import type {
  Invoice,
  InvoiceLineItem,
  PaymentMethod,
  SellerParty,
  VatRate,
} from '@/types/invoice';
import type { AdvanceInvoiceData, BuyerData, SellerData } from '@/types/invoice-types';

type ActionResult =
  | { success: true; invoiceId: string; offline?: boolean }
  | { success: false; error: string; invoiceId?: string };

function zodIssuesMessage(err: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ');
}

interface TenantSnap {
  id: string;
  nip: string;
  name: string;
  address: {
    countryCode?: string;
    addressLine1?: string;
    addressLine2?: string;
  } | null;
}

async function tenantContext(): Promise<{
  supabase: SupabaseClient;
  userId: string;
  tenant: TenantSnap;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Brak sesji użytkownika');

  const { getActiveOrgIdFromCookies } = await import(
    '@/lib/supabase/active-org'
  );
  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) throw new Error('Użytkownik nie jest przypisany do firmy');

  const { data: raw, error } = await supabase
    .from('tenants')
    .select('id, nip, name, address_json')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !raw) throw new Error('Brak danych firmy');

  return {
    supabase,
    userId: user.id,
    tenant: {
      id: raw.id as string,
      nip: raw.nip as string,
      name: raw.name as string,
      address: (raw.address_json as TenantSnap['address']) ?? null,
    },
  };
}

function normalizeBank(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  return raw.replace(/\s+/g, '');
}

function paymentMethodFa(m: AdvanceInvoiceSchemaIn['paymentMethod']): PaymentMethod {
  if (m === 'compensation') return 'other';
  return m as PaymentMethod;
}

function buildAdvanceEnvelope(parsed: AdvanceInvoiceSchemaIn): AdvanceInvoiceData {
  const bankNorm = normalizeBank(parsed.bankAccount ?? '');
  const buyer = parsed.buyer as BuyerData;
  const seller = parsed.seller as SellerData;

  return {
    invoiceType: 'advance',
    internalNumber: parsed.internalNumber,
    issueDate: parsed.issueDate,
    paymentMethod: parsed.paymentMethod,
    paymentDueDate: parsed.paymentDueDate,
    bankAccount: bankNorm,
    notes: parsed.notes?.trim()?.length ? parsed.notes.trim() : undefined,
    seller,
    buyer,
    advanceAmount: parsed.advanceAmount,
    totalContractAmount: parsed.totalContractAmount,
    expectedDeliveryDate: parsed.expectedDeliveryDate,
    vatRate: parsed.vatRate,
    description: parsed.description,
  };
}

function ghostAdvanceInvoice(envelope: AdvanceInvoiceData): Invoice {
  const totals = calculateAdvanceTotals(envelope);
  const rate = envelope.vatRate as VatRate;

  const line: InvoiceLineItem = {
    ordinal: 1,
    name: `Zaliczka: ${envelope.description}`,
    unit: 'szt.',
    quantity: 1,
    unitPriceNet: totals.advanceNet,
    vatRate: rate,
    netAmount: totals.advanceNet,
    vatAmount: totals.advanceVat,
    grossAmount: totals.advanceGross,
  };

  const seller: SellerParty = sellerPartyFromSellerData(envelope.seller);

  const buyer = buyerPartyFromBuyerData(envelope.buyer);

  return {
    internalNumber: envelope.internalNumber,
    type: 'ZAL',
    issueDate: envelope.issueDate,
    seller,
    buyer,
    lines: [line],
    netTotal: totals.advanceNet,
    vatTotal: totals.advanceVat,
    grossTotal: totals.advanceGross,
    payment: {
      amountDue: totals.advanceGross,
      currency: 'PLN',
      dueDate: envelope.paymentDueDate,
      method: paymentMethodFa(envelope.paymentMethod),
      bankAccount: normalizeBank(envelope.bankAccount),
    },
    notes: envelope.notes,
  };
}

async function insertAdvanceDraft(
  supabase: SupabaseClient,
  tenantId: string,
  ghost: Invoice,
  envelope: AdvanceInvoiceData,
): Promise<ActionResult> {
  const { data: inserted, error: invErr } = await supabase
    .from('invoices')
    .insert({
      tenant_id: tenantId,
      direction: 'outgoing',
      ksef_status: 'draft',
      internal_number: ghost.internalNumber,
      invoice_kind: 'advance',
      invoice_type: 'ZAL',
      issue_date: ghost.issueDate,
      seller_nip: ghost.seller.nip,
      buyer_nip: ghost.buyer.nip ?? null,
      seller_data: ghost.seller,
      buyer_data: ghost.buyer,
      payment_data: ghost.payment,
      payment_due_date: ghost.payment.dueDate,
      currency: 'PLN',
      net_total: ghost.netTotal,
      vat_total: ghost.vatTotal,
      gross_total: ghost.grossTotal,
      advance_amount: envelope.advanceAmount,
      notes: envelope.notes ?? null,
      fa3_data: ghost,
    })
    .select('id')
    .single();

  if (invErr || !inserted) {
    return { success: false, error: invErr?.message ?? 'Nie udało się zapisać faktury zaliczkowej' };
  }

  const invoiceId = inserted.id as string;

  const { error: lineErr } = await supabase.from('invoice_line_items').insert(
    ghost.lines.map((l) => ({
      invoice_id: invoiceId,
      ordinal: l.ordinal,
      name: l.name,
      unit: l.unit,
      quantity: l.quantity,
      unit_price_net: l.unitPriceNet,
      net_amount: l.netAmount,
      vat_rate: l.vatRate,
      vat_amount: l.vatAmount,
      gross_amount: l.grossAmount,
    })),
  );

  if (lineErr) {
    await supabase.from('invoices').delete().eq('id', invoiceId);
    return { success: false, error: `Błąd zapisu pozycji: ${lineErr.message}` };
  }

  return { success: true, invoiceId };
}

export async function saveAdvanceAction(raw: unknown): Promise<ActionResult> {
  try {
    const { supabase, tenant, userId } = await tenantContext();
    const parsed = advanceInvoiceSchema.safeParse(raw);
    if (!parsed.success) return { success: false, error: zodIssuesMessage(parsed.error) };

    const envelope = buildAdvanceEnvelope(parsed.data);
    const ghost = ghostAdvanceInvoice(envelope);

    const result = await insertAdvanceDraft(supabase, tenant.id, ghost, envelope);
    if (result.success) {
      await logAudit({
        action: 'invoice.draft_created',
        tenantId: tenant.id,
        userId,
        entityType: 'invoice',
        entityId: result.invoiceId,
        metadata: { kind: 'advance', internalNumber: ghost.internalNumber },
      });
      revalidatePath('/invoices');
    }
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Nieznany błąd' };
  }
}

export async function saveAndSendAdvanceAction(raw: unknown): Promise<ActionResult> {
  try {
    const { supabase, tenant, userId } = await tenantContext();
    const parsed = advanceInvoiceSchema.safeParse(raw);
    if (!parsed.success) return { success: false, error: zodIssuesMessage(parsed.error) };

    const envelope = buildAdvanceEnvelope(parsed.data);
    const ghost = ghostAdvanceInvoice(envelope);

    const saved = await insertAdvanceDraft(supabase, tenant.id, ghost, envelope);
    if (!saved.success) return saved;

    const invoiceId = saved.invoiceId;

    const enq = await enqueueKsefSubmitAfterDraft({
      supabase,
      tenantId: tenant.id,
      userId,
      invoiceId,
      nip: tenant.nip,
      invoice: ghost,
      advanceData: envelope,
      auditKind: 'advance',
      internalNumberForAudit: ghost.internalNumber,
    });

    if (!enq.ok) {
      return { success: false, error: enq.error, invoiceId };
    }

    return {
      success: true,
      invoiceId,
      offline: enq.mode === 'offline_queued',
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? formatInngestSendError(e) : 'Nieznany błąd wysyłki',
    };
  }
}
