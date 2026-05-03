'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { logAudit } from '@/lib/audit/log';
import { enqueueKsefSubmitAfterDraft } from '@/lib/invoices/ksef-submit-enqueue';
import { createClient } from '@/lib/supabase/server';
import { formatInngestSendError } from '@/lib/inngest/error-message';
import {
  correctionInvoiceSchema,
  type CorrectionInvoiceSchemaIn,
} from '@/lib/validators/invoice-validators';
import { calculateCorrectionTotals } from '@/lib/invoices/calculator';
import { calculateLineItem, calculateInvoiceTotals } from '@/lib/xml/invoice-calculator';
import type { Invoice, InvoiceLineItem, BuyerParty, PaymentMethod, SellerParty } from '@/types/invoice';
import type { BuyerB2B, BuyerData, CorrectionInvoiceData, InvoiceLine, SellerData } from '@/types/invoice-types';

// ══════════════════════════════════════════════════════════════════════════════
// Tenant
// ══════════════════════════════════════════════════════════════════════════════

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

  const { data: userData, error } = await supabase
    .from('users')
    .select('tenant_id, tenants(id, nip, name, address_json)')
    .eq('id', user.id)
    .single();

  if (error || !userData?.tenant_id) {
    throw new Error('Użytkownik nie jest przypisany do firmy');
  }

  const raw = Array.isArray(userData.tenants) ? userData.tenants[0] : userData.tenants;
  if (!raw) throw new Error('Brak danych firmy');

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

export type CorrectionActionResult =
  | { success: true; invoiceId: string; offline?: boolean }
  | { success: false; error: string; invoiceId?: string };

function zodIssuesMessage(err: { issues: readonly { path: PropertyKey[]; message: string }[] }): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ');
}

function mapPaymentMethodToFa(m: CorrectionInvoiceSchemaIn['paymentMethod']): PaymentMethod {
  if (m === 'compensation') return 'other';
  return m as PaymentMethod;
}

function normalizeBankAccount(raw: string | undefined): string | undefined {
  if (!raw || raw.trim() === '') return undefined;
  return raw.replace(/\s+/g, '');
}

function buyerDataFromParty(bp: BuyerParty): BuyerData {
  if (bp.nip) {
    const b: BuyerB2B = {
      type: 'b2b',
      idType: 'nip',
      nip: bp.nip.replace(/\s+/g, ''),
      name: bp.name,
      address: {
        countryCode: (bp.address.countryCode as string) || 'PL',
        addressLine1: bp.address.addressLine1 || ' ',
        addressLine2: bp.address.addressLine2 || ' ',
      },
      email: bp.email,
    };
    return b;
  }
  throw new Error('Korekta: brak NIP na fakturze pierwotnej (MVP obsługuje tylko B2B).');
}

function sellerDataFromParty(sp: SellerParty): SellerData {
  return {
    nip: sp.nip.replace(/\s+/g, ''),
    name: sp.name,
    address: {
      countryCode: (sp.address.countryCode as string) || 'PL',
      addressLine1: sp.address.addressLine1 || ' ',
      addressLine2: sp.address.addressLine2 || ' ',
    },
    email: sp.email,
  };
}

async function fetchParentInvoiceLines(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<InvoiceLine[]> {
  const { data, error } = await supabase
    .from('invoice_line_items')
    .select('name, unit, quantity, unit_price_net, vat_rate')
    .eq('invoice_id', invoiceId)
    .order('ordinal', { ascending: true });

  if (error || !data?.length) {
    throw new Error('Brak pozycji na fakturze pierwotnej lub błąd odczytu.');
  }

  return data.map((row) => ({
    name: row.name ?? '',
    unit: row.unit ?? 'szt',
    quantity: Number(row.quantity) || 0,
    unitPriceNet: Number(row.unit_price_net) || 0,
    vatRate: (row.vat_rate ?? '23') as InvoiceLine['vatRate'],
  }));
}

/** Uzupełnia `linesBefore` dla typu cancellation, jeśli użytkownik nie załączył tabeli. */
async function augmentCancellationLines(
  supabase: SupabaseClient,
  data: CorrectionInvoiceSchemaIn,
): Promise<CorrectionInvoiceSchemaIn> {
  if (data.correctionType !== 'cancellation') return data;
  if (data.linesBefore?.length) return data;

  const lines = await fetchParentInvoiceLines(supabase, data.parentInvoiceId);
  return { ...data, linesBefore: lines };
}

function buildCorrectionEnvelope(parsed: CorrectionInvoiceSchemaIn): CorrectionInvoiceData {
  const bankNorm = normalizeBankAccount(parsed.bankAccount ?? undefined);
  const buyer = parsed.buyer as BuyerData;
  const seller = parsed.seller as SellerData;

  return {
    invoiceType: 'correction',
    internalNumber: parsed.internalNumber,
    issueDate: parsed.issueDate,
    paymentMethod: parsed.paymentMethod,
    paymentDueDate: parsed.paymentDueDate,
    bankAccount: bankNorm,
    notes: parsed.notes,
    seller,
    buyer,
    parentInvoiceId: parsed.parentInvoiceId,
    parentInvoiceNumber: parsed.parentInvoiceNumber,
    parentKsefNumber: parsed.parentKsefNumber ?? undefined,
    parentInvoiceIssueDate: parsed.parentInvoiceIssueDate,
    correctionType: parsed.correctionType,
    correctionReason: parsed.correctionReason,
    linesBefore: parsed.linesBefore,
    linesAfter: parsed.linesAfter,
    amountChange: parsed.amountChange,
  };
}

function linesToStoredItems(correctionData: CorrectionInvoiceData): InvoiceLineItem[] {
  const { correctionType } = correctionData;

  if (correctionType === 'cancellation' && correctionData.linesBefore?.length) {
    return correctionData.linesBefore.map((line, idx) => {
      const neg = { ...line, quantity: -line.quantity };
      const calc = calculateLineItem({
        quantity: neg.quantity,
        unitPriceNet: neg.unitPriceNet,
        vatRate: neg.vatRate,
      });
      return {
        ordinal: idx + 1,
        name: neg.name,
        unit: neg.unit,
        quantity: neg.quantity,
        unitPriceNet: neg.unitPriceNet,
        vatRate: neg.vatRate,
        netAmount: calc.netAmount,
        vatAmount: calc.vatAmount,
        grossAmount: calc.grossAmount,
      };
    });
  }

  if (correctionType === 'amount_change' && correctionData.amountChange) {
    const ac = correctionData.amountChange;
    const pct =
      Math.abs(ac.netDelta) > 1e-9 ? Math.round((ac.vatDelta / ac.netDelta) * 100) : null;
    const rate =
      pct === 8 ? '8' : pct === 5 ? '5' : pct === 0 ? '0' : '23';
    const line: InvoiceLine = {
      name: ac.description,
      unit: 'szt.',
      quantity: 1,
      unitPriceNet: ac.netDelta,
      vatRate: rate as InvoiceLine['vatRate'],
    };
    const calc = calculateLineItem({
      quantity: 1,
      unitPriceNet: line.unitPriceNet,
      vatRate: line.vatRate,
    });
    return [
      {
        ordinal: 1,
        ...line,
        netAmount: ac.netDelta,
        vatAmount: ac.vatDelta,
        grossAmount: ac.grossDelta,
      },
    ];
  }

  const after = correctionData.linesAfter ?? [];
  return after.map((line, idx) => {
    const calc = calculateLineItem({
      quantity: line.quantity,
      unitPriceNet: line.unitPriceNet,
      vatRate: line.vatRate,
    });
    return {
      ordinal: idx + 1,
      name: line.name,
      unit: line.unit,
      quantity: line.quantity,
      unitPriceNet: line.unitPriceNet,
      vatRate: line.vatRate,
      ...calc,
    };
  });
}

function ghostInvoice(correctionEnvelope: CorrectionInvoiceData, lines: InvoiceLineItem[]): Invoice {
  const totals = calculateCorrectionTotals(correctionEnvelope);
  const totalsFromLines =
    lines.length > 0
      ? calculateInvoiceTotals(lines)
      : {
          netTotal: totals.netAfter,
          vatTotal: totals.vatAfter,
          grossTotal: totals.grossAfter,
        };

  const seller: SellerParty = {
    nip: correctionEnvelope.seller.nip,
    name: correctionEnvelope.seller.name,
    address: {
      countryCode: correctionEnvelope.seller.address.countryCode,
      addressLine1: correctionEnvelope.seller.address.addressLine1,
      addressLine2: correctionEnvelope.seller.address.addressLine2,
    },
    email: correctionEnvelope.seller.email,
  };

  let buyerParty: BuyerParty;
  const b = correctionEnvelope.buyer;
  if (b.type === 'b2b') {
    buyerParty = {
      nip: b.nip,
      name: b.name,
      address: {
        countryCode: b.address.countryCode,
        addressLine1: b.address.addressLine1,
        addressLine2: b.address.addressLine2,
      },
      email: b.email,
      jst: 2,
      gv: 2,
    };
  } else {
    buyerParty = {
      name: b.name,
      address: {
        countryCode: b.address.countryCode,
        addressLine1: b.address.addressLine1,
        addressLine2: b.address.addressLine2,
      },
      email: b.email,
      jst: 2,
      gv: 2,
    };
    if (b.idType === 'no_id') buyerParty.noIdMarker = true;
    else if (b.idType === 'pesel' && b.pesel) {
      buyerParty.nip = undefined;
      // PESEL konsument MVP: jako brak nip w FA - uproszczony marker
      buyerParty.noIdMarker = true;
    }
  }

  const method = mapPaymentMethodToFa(correctionEnvelope.paymentMethod);

  return {
    internalNumber: correctionEnvelope.internalNumber,
    type: 'KOR',
    issueDate: correctionEnvelope.issueDate,
    seller,
    buyer: buyerParty,
    lines,
    netTotal: totalsFromLines.netTotal,
    vatTotal: totalsFromLines.vatTotal,
    grossTotal: totalsFromLines.grossTotal,
    payment: {
      amountDue: totalsFromLines.grossTotal,
      currency: 'PLN',
      dueDate: correctionEnvelope.paymentDueDate,
      method,
      bankAccount: normalizeBankAccount(correctionEnvelope.bankAccount),
    },
    notes:
      correctionEnvelope.notes?.trim()?.length ?
        correctionEnvelope.notes.trim()
      : undefined,
  };
}

async function insertCorrection(
  supabase: SupabaseClient,
  tenantId: string,
  correctionEnvelope: CorrectionInvoiceData,
  lines: InvoiceLineItem[],
): Promise<CorrectionActionResult> {
  const ghost = ghostInvoice(correctionEnvelope, lines);
  const totals = calculateCorrectionTotals(correctionEnvelope);

  const { data: inserted, error } = await supabase
    .from('invoices')
    .insert({
      tenant_id: tenantId,
      direction: 'outgoing',
      ksef_status: 'draft',
      internal_number: ghost.internalNumber,
      invoice_kind: 'correction',
      invoice_type: 'KOR',
      issue_date: ghost.issueDate,
      parent_invoice_id: correctionEnvelope.parentInvoiceId,
      correction_reason: correctionEnvelope.correctionReason,
      correction_type: correctionEnvelope.correctionType,
      seller_nip: ghost.seller.nip,
      buyer_nip: ghost.buyer.nip ?? null,
      seller_data: correctionEnvelope.seller,
      buyer_data: ghost.buyer,
      payment_data: ghost.payment,
      payment_due_date: ghost.payment.dueDate,
      currency: 'PLN',
      net_total: totals.netAfter,
      vat_total: totals.vatAfter,
      gross_total: totals.grossAfter,
      notes: correctionEnvelope.notes ?? null,
      fa3_data: ghost,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return { success: false, error: error?.message ?? 'Nie udało się zapisać korekty' };
  }

  const invoiceId = inserted.id as string;

  const insLines = lines.map((line) => ({
    invoice_id: invoiceId,
    ordinal: line.ordinal,
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
    unit_price_net: line.unitPriceNet,
    net_amount: line.netAmount,
    vat_rate: line.vatRate,
    vat_amount: line.vatAmount,
    gross_amount: line.grossAmount,
  }));

  const { error: linesErr } = await supabase.from('invoice_line_items').insert(insLines);
  if (linesErr) {
    await supabase.from('invoices').delete().eq('id', invoiceId);
    return { success: false, error: `Błąd zapisu pozycji korekty: ${linesErr.message}` };
  }

  return { success: true, invoiceId };
}

async function normalizePayload(
  supabase: SupabaseClient,
  raw: CorrectionInvoiceSchemaIn,
): Promise<CorrectionInvoiceSchemaIn | { error: string }> {
  const augmented = await augmentCancellationLines(supabase, raw);
  const parsed = correctionInvoiceSchema.safeParse(augmented);
  if (!parsed.success) return { error: zodIssuesMessage(parsed.error) };
  return parsed.data;
}

export async function getCorrectionParentContextAction(parentId: string): Promise<
  | {
      success: true;
      issueDate: string;
      internalNumber: string | null;
      ksefNumber: string | null;
      grossTotal: number | null;
      seller: CorrectionInvoiceSchemaIn['seller'];
      buyer: CorrectionInvoiceSchemaIn['buyer'];
      linesBefore: NonNullable<CorrectionInvoiceSchemaIn['linesBefore']>;
      linesAfter: NonNullable<CorrectionInvoiceSchemaIn['linesAfter']>;
    }
  | { success: false; error: string }
> {
  try {
    const { supabase, tenant } = await tenantContext();

    const { data: row, error } = await supabase
      .from('invoices')
      .select('id, tenant_id, issue_date, internal_number, ksef_number, gross_total, seller_data, buyer_data')
      .eq('id', parentId)
      .eq('tenant_id', tenant.id)
      .eq('direction', 'outgoing')
      .eq('invoice_kind', 'regular')
      .eq('ksef_status', 'accepted')
      .maybeSingle();

    if (error || !row?.id) return { success: false, error: 'Nie znaleziono faktury pierwotnej.' };

    const sellerRow = row.seller_data as SellerParty | null;
    const buyerRow = row.buyer_data as BuyerParty | null;
    if (!sellerRow || !buyerRow?.nip)
      return { success: false, error: 'Niepełne dane pierwotnej (sprzedawca / nabywca).' };

    const linesRaw = await fetchParentInvoiceLines(supabase, parentId);

    return {
      success: true,
      issueDate: row.issue_date as string,
      internalNumber: row.internal_number,
      ksefNumber: row.ksef_number,
      grossTotal: row.gross_total,
      seller: sellerDataFromParty(sellerRow) as CorrectionInvoiceSchemaIn['seller'],
      buyer: buyerDataFromParty(buyerRow) as CorrectionInvoiceSchemaIn['buyer'],
      linesBefore: linesRaw,
      linesAfter: structuredClone(linesRaw),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveCorrectionDraftAction(
  raw: CorrectionInvoiceSchemaIn,
): Promise<CorrectionActionResult> {
  try {
    const { supabase, tenant, userId } = await tenantContext();
    const normalized = await normalizePayload(supabase, raw);
    if ('error' in normalized && typeof normalized.error === 'string') {
      return { success: false, error: normalized.error };
    }
    const envelope = buildCorrectionEnvelope(normalized as CorrectionInvoiceSchemaIn);
    const lines = linesToStoredItems(envelope);

    const result = await insertCorrection(supabase, tenant.id, envelope, lines);
    if (result.success) {
      await logAudit({
        action: 'invoice.draft_created',
        tenantId: tenant.id,
        userId,
        entityType: 'invoice',
        entityId: result.invoiceId,
        metadata: { kind: 'correction', internalNumber: envelope.internalNumber },
      });
      revalidatePath('/invoices');
    }
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Nieznany błąd' };
  }
}

export async function saveAndSendCorrectionAction(
  raw: CorrectionInvoiceSchemaIn,
): Promise<CorrectionActionResult> {
  try {
    const { supabase, tenant, userId } = await tenantContext();
    const normalized = await normalizePayload(supabase, raw);
    if ('error' in normalized && typeof normalized.error === 'string') {
      return { success: false, error: normalized.error };
    }
    const envelope = buildCorrectionEnvelope(normalized as CorrectionInvoiceSchemaIn);
    const lines = linesToStoredItems(envelope);
    const ghost = ghostInvoice(envelope, lines);

    const saved = await insertCorrection(supabase, tenant.id, envelope, lines);
    if (!saved.success) return saved;

    const invoiceId = saved.invoiceId;

    const enq = await enqueueKsefSubmitAfterDraft({
      supabase,
      tenantId: tenant.id,
      userId,
      invoiceId,
      nip: tenant.nip,
      invoice: ghost,
      correctionData: envelope,
      auditKind: 'correction',
      internalNumberForAudit: envelope.internalNumber,
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
