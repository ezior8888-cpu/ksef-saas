'use server';

import { revalidatePath } from 'next/cache';

import { logAudit } from '@/lib/audit/log';
import { enqueueKsefSubmitAfterDraft } from '@/lib/invoices/ksef-submit-enqueue';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrgIdFromCookies } from '@/lib/supabase/active-org';
import { lookupCompanyByNip } from '@/lib/gus/client';
import { formatInngestSendError } from '@/lib/inngest/error-message';
import {
  calculateInvoiceTotals,
  calculateLineItem,
  validateNipChecksum,
} from '@/lib/xml/invoice-calculator';
import type { InvoiceFormValues } from '@/lib/schemas/invoice-form';
import type {
  Address,
  BuyerParty,
  Invoice,
  InvoiceLineItem,
  PaymentInfo,
  PaymentMethod,
  SellerParty,
} from '@/types/invoice';

// ═══════════════════════════════════════════════════════════════
// Helpery tenant / snapshot faktury
// ═══════════════════════════════════════════════════════════════

interface TenantAddressSnapshot {
  countryCode?: string;
  addressLine1?: string;
  addressLine2?: string;
}

interface TenantSnapshot {
  id: string;
  nip: string;
  name: string;
  address: TenantAddressSnapshot | null;
}

/** Pobiera kontekst zalogowanego usera + jego tenanta.
 *  Rzuca wyjątek jeśli user niezalogowany lub bez tenanta - powinien
 *  wtedy być na `/onboarding`, wejście na formularz z `null` to bug. */
async function getTenantContext(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  tenant: TenantSnapshot;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Brak sesji użytkownika');

  const tenantId = await getActiveOrgIdFromCookies();
  if (!tenantId) {
    throw new Error('Użytkownik nie jest przypisany do firmy (onboarding)');
  }

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
      address: (raw.address_json as TenantAddressSnapshot | null) ?? null,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// lookupBuyerAction - cache kontrahentów + GUS fallback
// ═══════════════════════════════════════════════════════════════

export type LookupBuyerResult =
  | {
      success: true;
      source: 'cache' | 'gus';
      data: {
        nip: string;
        name: string;
        addressLine1: string;
        addressLine2: string;
      };
    }
  | { success: false; error: string };

interface ContractorAddress {
  countryCode?: string;
  addressLine1?: string;
  addressLine2?: string;
}

export async function lookupBuyerAction(
  nip: string
): Promise<LookupBuyerResult> {
  if (!/^\d{10}$/.test(nip)) {
    return { success: false, error: 'NIP musi zawierać 10 cyfr' };
  }
  if (!validateNipChecksum(nip)) {
    return { success: false, error: 'Nieprawidłowa suma kontrolna NIP' };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let tenantId: string;
  try {
    const ctx = await getTenantContext();
    supabase = ctx.supabase;
    tenantId = ctx.tenant.id;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Brak kontekstu tenanta',
    };
  }

  // 1) Cache - lokalna tabela `contractors` (per tenant).
  const { data: cached } = await supabase
    .from('contractors')
    .select('nip, name, address')
    .eq('tenant_id', tenantId)
    .eq('nip', nip)
    .maybeSingle();

  if (cached) {
    const addr = (cached.address as ContractorAddress | null) ?? {};
    // Update last_used_at żeby rozpinać "ostatnio używane" w przyszłym UI.
    await supabase
      .from('contractors')
      .update({ last_used_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('nip', nip);

    return {
      success: true,
      source: 'cache',
      data: {
        nip: cached.nip as string,
        name: cached.name as string,
        addressLine1: addr.addressLine1 ?? '',
        addressLine2: addr.addressLine2 ?? '',
      },
    };
  }

  // 2) Fallback: GUS REGON.
  const gus = await lookupCompanyByNip(nip);
  if (gus.kind === 'not-found') {
    return {
      success: false,
      error: 'Nie znaleziono firmy w GUS. Sprawdź numer NIP.',
    };
  }
  if (gus.kind === 'error') {
    return {
      success: false,
      error:
        'GUS chwilowo niedostępny. Spróbuj ponownie za chwilę lub uzupełnij dane ręcznie.',
    };
  }

  const addressLine1 = `${gus.data.street} ${gus.data.buildingNumber}${
    gus.data.localNumber ? '/' + gus.data.localNumber : ''
  }`.trim();
  const addressLine2 = `${gus.data.postalCode} ${gus.data.city}`.trim();

  // Zapisz w cache (upsert po unique (tenant_id, nip)). Używamy fire-and-forget
  // bez przerywania flow jeśli cache padnie - user i tak dostanie dane.
  await supabase.from('contractors').upsert(
    {
      tenant_id: tenantId,
      nip: gus.data.nip,
      name: gus.data.name,
      address: {
        countryCode: 'PL',
        addressLine1,
        addressLine2,
      },
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,nip' }
  );

  return {
    success: true,
    source: 'gus',
    data: {
      nip: gus.data.nip,
      name: gus.data.name,
      addressLine1,
      addressLine2,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Budowanie pełnego obiektu Invoice z InvoiceFormValues
// ═══════════════════════════════════════════════════════════════

function buildInvoiceFromForm(
  values: InvoiceFormValues,
  tenant: TenantSnapshot
): Invoice {
  const lines: InvoiceLineItem[] = values.lines.map((line, idx) => {
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
      netAmount: calc.netAmount,
      vatAmount: calc.vatAmount,
      grossAmount: calc.grossAmount,
    };
  });

  const totals = calculateInvoiceTotals(lines);

  const sellerAddress: Address = {
    countryCode: tenant.address?.countryCode ?? 'PL',
    addressLine1: tenant.address?.addressLine1 ?? '',
    addressLine2: tenant.address?.addressLine2 ?? '',
  };

  const seller: SellerParty = {
    nip: tenant.nip,
    name: tenant.name,
    address: sellerAddress,
  };

  const buyerEmail =
    typeof values.buyerEmail === 'string' && values.buyerEmail.length > 0
      ? values.buyerEmail
      : undefined;

  const buyer: BuyerParty = (() => {
    const jst = 2 as const;
    const gv = 2 as const;
    const addr: Address = {
      countryCode: 'PL',
      addressLine1: values.buyerAddressLine1,
      addressLine2: values.buyerAddressLine2,
    };

    if (!values.buyerIsConsumer) {
      return {
        nip: values.buyerNip,
        name: values.buyerName,
        address: addr,
        jst,
        gv,
        email: buyerEmail,
      };
    }

    const t = values.buyerConsumerIdType;
    switch (t) {
      case 'pesel':
        return {
          name: values.buyerName,
          address: addr,
          pesel: values.buyerPesel.replace(/\D/g, ''),
          jst,
          gv,
          email: buyerEmail,
        };
      case 'no_id':
        return {
          name: values.buyerName,
          address: addr,
          noIdMarker: true,
          jst,
          gv,
          email: buyerEmail,
        };
      case 'id_card':
      case 'passport':
        return {
          name: values.buyerName,
          address: addr,
          nrInny: values.buyerIdDocument.trim(),
          jst,
          gv,
          email: buyerEmail,
        };
      default:
        return {
          name: values.buyerName,
          address: addr,
          noIdMarker: true,
          jst,
          gv,
          email: buyerEmail,
        };
    }
  })();

  const payment: PaymentInfo = {
    amountDue: totals.grossTotal,
    currency: 'PLN',
    dueDate: values.paymentDueDate,
    method: values.paymentMethod as PaymentMethod,
    bankAccount: values.bankAccount || undefined,
  };

  return {
    internalNumber: values.internalNumber,
    type: 'VAT',
    issueDate: values.issueDate,
    saleDate: values.saleDate && values.saleDate.length ? values.saleDate : undefined,
    seller,
    buyer,
    lines,
    netTotal: totals.netTotal,
    vatTotal: totals.vatTotal,
    grossTotal: totals.grossTotal,
    payment,
    notes: values.notes && values.notes.length ? values.notes : undefined,
  };
}

/** Kolumny B2C w `public.invoices` (ułatwia raportowanie bez parsowania JSON). */
function buyerColumnsFromInvoiceForm(values: InvoiceFormValues): {
  is_b2c: boolean;
  buyer_id_type: 'nip' | 'pesel' | 'id_card' | 'passport' | 'no_id';
  buyer_pesel: string | null;
  buyer_id_number: string | null;
} {
  if (!values.buyerIsConsumer) {
    return {
      is_b2c: false,
      buyer_id_type: 'nip',
      buyer_pesel: null,
      buyer_id_number: null,
    };
  }

  const t = values.buyerConsumerIdType ?? 'no_id';

  const pes =
    t === 'pesel' ? values.buyerPesel.replace(/\D/g, '') || null : null;
  const idNum =
    t === 'id_card' || t === 'passport'
      ? values.buyerIdDocument.trim() || null
      : null;

  return {
    is_b2c: true,
    buyer_id_type: t,
    buyer_pesel: pes,
    buyer_id_number: idNum,
  };
}

// ═══════════════════════════════════════════════════════════════
// saveDraftAction / saveAndSendInvoiceAction
// ═══════════════════════════════════════════════════════════════

export type InvoiceActionResult =
  | { success: true; invoiceId: string; offline?: boolean }
  /** `invoiceId` — zapisany szkic (np. brak certyfikatu KSeF; user może do niego wrócić). */
  | { success: false; error: string; invoiceId?: string };

/** Wspólna ścieżka zapisu: INSERT invoices + line_items w transakcji
 *  "best-effort" (Supabase nie daje klienckich transakcji; w razie błędu
 *  linii usuwamy fakturę-matkę żeby nie zostawiać sierot). */
async function insertInvoiceAndLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  invoice: Invoice,
  formValues?: InvoiceFormValues,
): Promise<InvoiceActionResult> {
  const b2c = formValues ? buyerColumnsFromInvoiceForm(formValues) : null;

  const { data: inserted, error: invErr } = await supabase
    .from('invoices')
    .insert({
      tenant_id: tenantId,
      // DB CHECK: 'outgoing' | 'incoming' - NIE 'issued'.
      direction: 'outgoing',
      ksef_status: 'draft',
      internal_number: invoice.internalNumber,
      invoice_type: invoice.type,
      issue_date: invoice.issueDate,
      sale_date: invoice.saleDate ?? null,
      seller_nip: invoice.seller.nip,
      buyer_nip: invoice.buyer.nip ?? null,
      seller_data: invoice.seller,
      buyer_data: invoice.buyer,
      payment_data: invoice.payment,
      payment_due_date: invoice.payment.dueDate,
      currency: invoice.payment.currency,
      notes: invoice.notes ?? null,
      net_total: invoice.netTotal,
      vat_total: invoice.vatTotal,
      gross_total: invoice.grossTotal,
      is_b2c: b2c?.is_b2c ?? false,
      buyer_id_type: b2c?.buyer_id_type ?? 'nip',
      buyer_pesel: b2c?.buyer_pesel ?? null,
      buyer_id_number: b2c?.buyer_id_number ?? null,
      // fa3_data NOT NULL w 00001 - trzymamy tam ten sam snapshot co w
      // seller_data/buyer_data/payment_data, plus ewentualne adnotacje.
      // Generator XML i tak odtworzy go z `invoice` w jobie - to jest
      // jedynie źródło prawdy dla UI/raportów.
      fa3_data: invoice,
    })
    .select('id')
    .single();

  if (invErr || !inserted) {
    // Postgres 23505 = unique_violation. Po migracji 00028 to oznacza duplikat
    // `internal_number` w obrębie tego tenanta — najczęściej double-click "Wystaw
    // i wyślij" lub równoległa próba zapisu z innej karty. Friendly message
    // zamiast technicznego "duplicate key value violates unique constraint
    // \"uq_invoices_tenant_internal_number\"".
    if (invErr?.code === '23505') {
      return {
        success: false,
        error: `Faktura o numerze "${invoice.internalNumber}" już istnieje. Sprawdź listę faktur lub wybierz inny numer.`,
      };
    }
    return {
      success: false,
      error: invErr?.message ?? 'Nie udało się zapisać faktury',
    };
  }

  const { error: linesErr } = await supabase.from('invoice_line_items').insert(
    invoice.lines.map((line) => ({
      invoice_id: inserted.id,
      ordinal: line.ordinal,
      name: line.name,
      unit: line.unit,
      quantity: line.quantity,
      unit_price_net: line.unitPriceNet,
      net_amount: line.netAmount,
      vat_rate: line.vatRate,
      vat_amount: line.vatAmount,
      gross_amount: line.grossAmount,
    }))
  );

  if (linesErr) {
    // Rollback best-effort. Nawet jeśli się nie uda - faktura bez linii jest
    // w stanie 'draft' i user może ją edytować/usunąć ręcznie.
    await supabase.from('invoices').delete().eq('id', inserted.id);
    return {
      success: false,
      error: `Błąd zapisu pozycji: ${linesErr.message}`,
    };
  }

  return { success: true, invoiceId: inserted.id as string };
}

export async function saveDraftAction(
  values: InvoiceFormValues
): Promise<InvoiceActionResult> {
  try {
    const { supabase, tenant, userId } = await getTenantContext();
    const invoice = buildInvoiceFromForm(values, tenant);

    const result = await insertInvoiceAndLines(supabase, tenant.id, invoice, values);
    if (result.success && result.invoiceId) {
      await logAudit({
        action: 'invoice.draft_created',
        tenantId: tenant.id,
        userId,
        entityType: 'invoice',
        entityId: result.invoiceId,
        metadata: {
          internalNumber: invoice.internalNumber,
          grossTotal: invoice.grossTotal,
        },
      });
      revalidatePath('/invoices');
    }
    return result;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Nieznany błąd',
    };
  }
}

export async function saveAndSendInvoiceAction(
  values: InvoiceFormValues
): Promise<InvoiceActionResult> {
  try {
    const { supabase, tenant, userId } = await getTenantContext();
    const invoice = buildInvoiceFromForm(values, tenant);

    // 1) Najpierw draft - jeśli DB padnie, nie publikujemy eventu-sieroty.
    const saved = await insertInvoiceAndLines(supabase, tenant.id, invoice, values);
    if (!saved.success) return saved;

    const enq = await enqueueKsefSubmitAfterDraft({
      supabase,
      tenantId: tenant.id,
      userId,
      invoiceId: saved.invoiceId,
      nip: tenant.nip,
      invoice,
      auditKind: 'regular',
      internalNumberForAudit: invoice.internalNumber,
    });

    if (!enq.ok) {
      if (saved.invoiceId) {
        const isSettingsRead = enq.error.startsWith('Nie można sprawdzić ustawień');
        const isNoCert =
          enq.error.includes('Najpierw wgraj certyfikat') ||
          enq.error.includes('Brak certyfikatu KSeF');
        if (isSettingsRead || isNoCert) {
          await logAudit({
            action: 'invoice.draft_created',
            tenantId: tenant.id,
            userId,
            entityType: 'invoice',
            entityId: saved.invoiceId,
            metadata: {
              internalNumber: invoice.internalNumber,
              note: isSettingsRead ? 'submit_aborted_tenant_read_error' : 'submit_blocked_no_ksef_cert',
            },
          });
        }
      }
      return {
        success: false,
        error: enq.error,
        invoiceId: saved.invoiceId,
      };
    }

    if (!saved.invoiceId) {
      return { success: false, error: 'Brak invoiceId po zapisie szkicu' };
    }

    return {
      success: true,
      invoiceId: saved.invoiceId,
      offline: enq.mode === 'offline_queued',
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? formatInngestSendError(err)
          : 'Nieznany błąd wysyłki',
    };
  }
}
