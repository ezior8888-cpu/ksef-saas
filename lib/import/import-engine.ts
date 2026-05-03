/**
 * Centralny silnik importu: deduplikacja numerów, kontrahenci, produkty, zapis faktur.
 * Używa service role (`createAdminClient`) — wywoływać tylko z zaufanej ścieżki serwerowej / jobów.
 */

import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';
import type { BuyerParty, PaymentInfo, SellerParty } from '@/types/invoice';
import type { ParsedInvoice, ParsedLine, ParsedParty } from './fa3-parser';

export interface ImportEngineParams {
  tenantId: string;
  importJobId: string;
  invoices: ParsedInvoice[];
  source: string;
  /** Domyślnie `outgoing` (CSV / sprzedaż); `incoming` dla historii odebranej z KSeF. */
  invoiceDirection?: 'outgoing' | 'incoming';
  /**
   * Status KSeF w DB (`draft` przy imporcie plików).
   * Historia z KSeF — zwykle `accepted` (faktury już w systemie KSeF).
   */
  invoiceKsefStatus?: string | null;
}

export interface ImportEngineResult {
  invoicesImported: number;
  contractorsCreated: number;
  contractorsUpdated: number;
  productsCreated: number;
  warnings: string[];
}

type AdminSupabase = ReturnType<typeof createAdminClient>;

export async function processImportedInvoices(
  params: ImportEngineParams,
): Promise<ImportEngineResult> {
  const supabase = createAdminClient();
  const warnings: string[] = [];

  for (const inv of params.invoices) {
    if (inv.warnings?.length) warnings.push(...inv.warnings.map((w) => `${inv.invoiceNumber}: ${w}`));
  }

  const invoiceDirection = params.invoiceDirection ?? 'outgoing';
  const counterparty =
    invoiceDirection === 'incoming' ? ('seller' as const) : ('buyer' as const);

  const contractorsMap = extractUniqueContractors(params.invoices, counterparty);

  const contractorResult = await upsertContractors(
    supabase,
    params.tenantId,
    contractorsMap,
    warnings,
  );

  const productsMap = extractUniqueProducts(params.invoices);
  const productsCreated = await upsertProducts(supabase, params.tenantId, productsMap, warnings);

  const invoicesImported = await insertInvoices(
    supabase,
    params.tenantId,
    params.invoices,
    params.source,
    params.importJobId,
    invoiceDirection,
    params.invoiceKsefStatus ?? 'draft',
    warnings,
  );

  return {
    invoicesImported,
    contractorsCreated: contractorResult.created,
    contractorsUpdated: contractorResult.updated,
    productsCreated,
    warnings,
  };
}

// ─── Kontrahenci ─────────────────────────────────────────────────────────────

interface ContractorSummary {
  nip: string;
  name: string;
  address?: {
    addressLine1?: string;
    addressLine2?: string;
    countryCode?: string;
  };
  email?: string;
  invoiceCount: number;
  firstInvoiceDate: string;
  lastInvoiceDate: string;
}

function extractUniqueContractors(
  invoices: ParsedInvoice[],
  counterparty: 'buyer' | 'seller',
): Map<string, ContractorSummary> {
  const map = new Map<string, ContractorSummary>();

  for (const inv of invoices) {
    const party = counterparty === 'seller' ? inv.seller : inv.buyer;
    const nip = party.nip?.replace(/\D/g, '');
    if (!nip || nip.length !== 10) continue;

    const existing = map.get(nip);
    if (existing) {
      existing.invoiceCount += 1;
      if (inv.issueDate < existing.firstInvoiceDate) existing.firstInvoiceDate = inv.issueDate;
      if (inv.issueDate > existing.lastInvoiceDate) existing.lastInvoiceDate = inv.issueDate;
      if (party.name && party.name.length > existing.name.length) existing.name = party.name;
    } else {
      map.set(nip, {
        nip,
        name: party.name,
        address: {
          addressLine1: party.addressLine1,
          addressLine2: party.addressLine2,
          countryCode: party.countryCode ?? 'PL',
        },
        email: party.email,
        invoiceCount: 1,
        firstInvoiceDate: inv.issueDate,
        lastInvoiceDate: inv.issueDate,
      });
    }
  }

  return map;
}

async function upsertContractors(
  supabase: AdminSupabase,
  tenantId: string,
  contractorsMap: Map<string, ContractorSummary>,
  warnings: string[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  if (contractorsMap.size === 0) return { created, updated };

  const nips = Array.from(contractorsMap.keys());
  const { data: existing, error: selErr } = await supabase
    .from('contractors')
    .select('id, nip, name, email, address')
    .eq('tenant_id', tenantId)
    .in('nip', nips);

  if (selErr) {
    warnings.push(`Kontrahenci: odczyt — ${selErr.message}`);
    return { created: 0, updated: 0 };
  }

  const existingMap = new Map(existing?.map((c) => [c.nip, c]) ?? []);

  const rowsToInsert = Array.from(contractorsMap.values()).filter((s) => !existingMap.has(s.nip));

  if (rowsToInsert.length > 0) {
    const { data: ins, error: insErr } = await supabase
      .from('contractors')
      .insert(
        rowsToInsert.map((summary) => ({
          tenant_id: tenantId,
          nip: summary.nip,
          name: summary.name,
          address: summary.address as Json,
          email: summary.email ?? null,
          last_used_at: new Date().toISOString(),
        })),
      )
      .select('id');

    if (insErr) warnings.push(`Kontrahenci: insert — ${insErr.message}`);
    else created = ins?.length ?? 0;
  }

  for (const [nip, summary] of contractorsMap.entries()) {
    const row = existingMap.get(nip);
    if (!row?.id) continue;

    const { error: updErr } = await supabase
      .from('contractors')
      .update({
        name: summary.name,
        address: summary.address as Json,
        email: summary.email ?? row.email ?? null,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (updErr) warnings.push(`Kontrahent NIP ${nip}: update — ${updErr.message}`);
    else updated++;
  }

  return { created, updated };
}

// ─── Produkty ──────────────────────────────────────────────────────────────

interface ProductSummary {
  name: string;
  unit: string;
  defaultPriceNet: number;
  defaultVatRate: string;
  useCount: number;
}

function extractUniqueProducts(invoices: ParsedInvoice[]): Map<string, ProductSummary> {
  const map = new Map<string, ProductSummary>();

  for (const inv of invoices) {
    for (const line of inv.lines) {
      const key = normalizeProductKey(line.name, line.unit);
      if (!key) continue;

      const existing = map.get(key);
      if (existing) {
        existing.useCount += 1;
      } else {
        map.set(key, {
          name: line.name,
          unit: line.unit,
          defaultPriceNet: line.unitPriceNet,
          defaultVatRate: line.vatRate,
          useCount: 1,
        });
      }
    }
  }

  return map;
}

function normalizeProductKey(name: string, unit: string): string | null {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized.length < 3) return null;
  if (normalized.includes('pozycja zbiorcza') || normalized === 'usługa') return null;
  return `${normalized}|${unit.trim().toLowerCase()}`;
}

async function upsertProducts(
  supabase: AdminSupabase,
  tenantId: string,
  productsMap: Map<string, ProductSummary>,
  warnings: string[],
): Promise<number> {
  if (productsMap.size === 0) return 0;

  const { data: existingRows, error: selErr } = await supabase
    .from('products')
    .select('id, name, unit, use_count')
    .eq('tenant_id', tenantId);

  if (selErr) {
    warnings.push(`Produkty: odczyt — ${selErr.message}`);
    return 0;
  }

  const existingByKey = new Map<string, { id: string; use_count: number }>();
  for (const row of existingRows ?? []) {
    const k = normalizeProductKey(row.name, row.unit);
    if (k) existingByKey.set(k, { id: row.id, use_count: row.use_count ?? 0 });
  }

  let created = 0;

  const toInsert: {
    tenant_id: string;
    name: string;
    unit: string;
    default_price_net: number;
    default_vat_rate: string;
    use_count: number;
    last_used_at: string;
  }[] = [];

  for (const summary of productsMap.values()) {
    const key = normalizeProductKey(summary.name, summary.unit);
    if (!key) continue;

    const hit = existingByKey.get(key);
    if (hit) {
      const { error } = await supabase
        .from('products')
        .update({
          use_count: hit.use_count + summary.useCount,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', hit.id);

      if (error) warnings.push(`Produkt „${summary.name.slice(0, 40)}…”: update — ${error.message}`);
    } else {
      toInsert.push({
        tenant_id: tenantId,
        name: summary.name,
        unit: summary.unit || 'szt.',
        default_price_net: summary.defaultPriceNet,
        default_vat_rate: summary.defaultVatRate,
        use_count: summary.useCount,
        last_used_at: new Date().toISOString(),
      });
      existingByKey.set(key, { id: '__pending__', use_count: summary.useCount });
    }
  }

  if (toInsert.length === 0) return 0;

  const { data: insData, error: insErr } = await supabase
    .from('products')
    .insert(toInsert)
    .select('id');

  if (insErr) {
    warnings.push(`Produkty: insert — ${insErr.message}`);
    return 0;
  }

  created = insData?.length ?? 0;
  return created;
}

// ─── Faktury ───────────────────────────────────────────────────────────────

async function insertInvoices(
  supabase: AdminSupabase,
  tenantId: string,
  invoices: ParsedInvoice[],
  source: string,
  importJobId: string,
  invoiceDirection: 'outgoing' | 'incoming',
  invoiceKsefStatus: string,
  warnings: string[],
): Promise<number> {
  if (invoices.length === 0) return 0;

  const numbers = [...new Set(invoices.map((i) => i.invoiceNumber.trim()).filter(Boolean))];
  const ksefNumbers = [
    ...new Set(
      invoices
        .map((i) => i.ksefNumber?.trim())
        .filter((x): x is string => !!x?.length),
    ),
  ];

  const { data: existingNums, error: exNumErr } = await supabase
    .from('invoices')
    .select('internal_number')
    .eq('tenant_id', tenantId)
    .in('internal_number', numbers);

  if (exNumErr) warnings.push(`Faktury: odczyt duplikatów (numer) — ${exNumErr.message}`);

  const existingNumbers = new Set(
    existingNums?.map((r) => r.internal_number).filter((x): x is string => !!x?.trim()) ?? [],
  );

  let existingKsef = new Set<string>();
  if (ksefNumbers.length > 0) {
    const { data: ksefExisting, error: exKErr } = await supabase
      .from('invoices')
      .select('ksef_number')
      .eq('tenant_id', tenantId)
      .in('ksef_number', ksefNumbers);

    if (exKErr) warnings.push(`Faktury: odczyt duplikatów (ksef) — ${exKErr.message}`);
    else {
      existingKsef = new Set(
        (ksefExisting ?? [])
          .map((r) => r.ksef_number as string | null)
          .filter((x): x is string => !!x?.trim()),
      );
    }
  }

  const seenInBatch = new Set<string>();
  const seenKsefInBatch = new Set<string>();
  let imported = 0;

  for (const inv of invoices) {
    const num = inv.invoiceNumber.trim();

    if (!num) {
      warnings.push('Pominięto fakturę bez numeru');
      continue;
    }

    const ksefNorm = inv.ksefNumber?.trim();
    if (ksefNorm) {
      if (existingKsef.has(ksefNorm)) {
        warnings.push(`Pominięto duplikat (DB, KSeF): ${ksefNorm}`);
        continue;
      }
      if (seenKsefInBatch.has(ksefNorm)) {
        warnings.push(`Pominięto duplikat (import, KSeF): ${ksefNorm}`);
        continue;
      }
    }

    if (existingNumbers.has(num)) {
      warnings.push(`Pominięto duplikat (DB): ${num}`);
      continue;
    }
    if (seenInBatch.has(num)) {
      warnings.push(`Pominięto duplikat (plik importu): ${num}`);
      continue;
    }

    seenInBatch.add(num);
    if (ksefNorm) seenKsefInBatch.add(ksefNorm);

    const sellerNipDigits = inv.seller.nip?.replace(/\D/g, '') ?? '';
    if (invoiceDirection === 'outgoing' && sellerNipDigits.length !== 10) {
      warnings.push(`${num}: brak NIP sprzedawcy w importie — kolumna seller_nip została pusta`);
    }

    const invoiceKind = normalizeInvoiceKindForInsert(inv, warnings);
    const faInvoiceType = mapParsedKindToFaVatType(inv.invoiceType);
    const idCols = buyerIdentityFromParsed(inv.buyer);
    const payment = paymentInfoFromParsed(inv);

    const acceptedNow =
      invoiceKsefStatus === 'accepted' ? new Date().toISOString() : null;

    const { data: inserted, error: invErr } = await supabase
      .from('invoices')
      .insert({
        tenant_id: tenantId,
        direction: invoiceDirection,
        internal_number: num,
        ksef_status: invoiceKsefStatus,
        ksef_accepted_at: acceptedNow,
        ksef_number: ksefNorm ?? null,
        invoice_kind: invoiceKind,
        invoice_type: faInvoiceType,
        issue_date: inv.issueDate,
        sale_date: null,
        seller_nip: inv.seller.nip?.replace(/\D/g, '').slice(0, 10) || null,
        buyer_nip: idCols.buyer_nip,
        currency: 'PLN',
        net_total: inv.totals.netTotal,
        vat_total: inv.totals.vatTotal,
        gross_total: inv.totals.grossTotal,
        payment_due_date: inv.paymentDueDate ?? null,
        fa3_data: buildImportFa3Json(inv, source, importJobId),
        seller_data: sellerPartyFromParsed(inv.seller) as unknown as Json,
        buyer_data: buyerPartyFromParsed(inv.buyer) as unknown as Json,
        payment_data: payment as unknown as Json,
        is_b2c: idCols.is_b2c,
        buyer_id_type: idCols.buyer_id_type,
        buyer_pesel: idCols.buyer_pesel,
        buyer_id_number: idCols.buyer_id_number,
        notes: `[import] ${source} job=${importJobId}`,
      })
      .select('id')
      .single();

    if (invErr || !inserted?.id) {
      warnings.push(`Błąd zapisu faktury ${num}: ${invErr?.message ?? 'unknown'}`);
      continue;
    }

    const lineRows = inv.lines.map((line, idx) => {
      const { vatAmount, grossAmount } = lineVatGross(line);
      return {
        invoice_id: inserted.id,
        ordinal: line.position ?? idx + 1,
        name: line.name,
        unit: line.unit,
        quantity: line.quantity,
        unit_price_net: line.unitPriceNet,
        net_amount: line.netAmount,
        vat_rate: line.vatRate,
        vat_amount: vatAmount,
        gross_amount: grossAmount,
      };
    });

    const { error: linesErr } = await supabase.from('invoice_line_items').insert(lineRows);

    if (linesErr) {
      warnings.push(`Faktura ${num}: błąd pozycji — ${linesErr.message}`);
      await supabase.from('invoices').delete().eq('id', inserted.id);
      continue;
    }

    imported++;
    existingNumbers.add(num);
    if (ksefNorm) existingKsef.add(ksefNorm);
  }

  return imported;
}

/** Korekty / zaliczki / final wymagają powiązań w DB — przy imporcie zapis jako `regular` + komunikat. */
function normalizeInvoiceKindForInsert(inv: ParsedInvoice, warnings: string[]): 'regular' {
  if (inv.invoiceType !== 'regular') {
    warnings.push(
      `${inv.invoiceNumber}: invoice_kind ustawiono na „regular” (typ źródłowy „${inv.invoiceType}” wymaga pól powiązanych nieobecnych w imporcie)`,
    );
  }
  return 'regular';
}

function mapParsedKindToFaVatType(
  kind: ParsedInvoice['invoiceType'],
): 'VAT' | 'KOR' | 'ZAL' | 'ROZ' {
  switch (kind) {
    case 'correction':
      return 'KOR';
    case 'advance':
      return 'ZAL';
    case 'final':
      return 'ROZ';
    default:
      return 'VAT';
  }
}

function buyerIdentityFromParsed(buyer: ParsedParty): {
  is_b2c: boolean;
  buyer_id_type: 'nip' | 'pesel' | 'no_id';
  buyer_nip: string | null;
  buyer_pesel: string | null;
  buyer_id_number: string | null;
} {
  const nip = buyer.nip?.replace(/\D/g, '') ?? '';
  if (nip.length === 10) {
    return {
      is_b2c: false,
      buyer_id_type: 'nip',
      buyer_nip: nip,
      buyer_pesel: null,
      buyer_id_number: null,
    };
  }

  const pesel = buyer.pesel?.replace(/\D/g, '') ?? '';
  if (pesel.length === 11) {
    return {
      is_b2c: true,
      buyer_id_type: 'pesel',
      buyer_nip: null,
      buyer_pesel: pesel,
      buyer_id_number: null,
    };
  }

  if (
    (buyer.vatUeNumber && buyer.vatUeNumber.trim()) ||
    (buyer.nrInny && buyer.nrInny.trim())
  ) {
    return {
      is_b2c: false,
      buyer_id_type: 'nip',
      buyer_nip: null,
      buyer_pesel: null,
      buyer_id_number: null,
    };
  }

  return {
    is_b2c: true,
    buyer_id_type: 'no_id',
    buyer_nip: null,
    buyer_pesel: null,
    buyer_id_number: null,
  };
}

function sellerPartyFromParsed(seller: ParsedParty): SellerParty {
  const nip = seller.nip?.replace(/\D/g, '').slice(0, 10) ?? '';
  return {
    nip: nip || '0000000000',
    name: seller.name || '—',
    address: {
      countryCode: (seller.countryCode as 'PL') ?? 'PL',
      addressLine1: seller.addressLine1 ?? '—',
      addressLine2: seller.addressLine2 ?? '',
    },
    email: seller.email,
    phone: undefined,
  };
}

function buyerPartyFromParsed(buyer: ParsedParty): BuyerParty {
  const hasNip = !!buyer.nip && buyer.nip.replace(/\D/g, '').length === 10;

  return {
    name: buyer.name || 'Nieznany',
    nip: hasNip ? buyer.nip!.replace(/\D/g, '').slice(0, 10) : undefined,
    pesel: buyer.pesel,
    vatUeNumber: buyer.vatUeNumber,
    nrInny: buyer.nrInny,
    noIdMarker: !!(buyer.brakId ?? (!buyer.nip && !buyer.pesel && !buyer.vatUeNumber)),
    address: {
      countryCode: (buyer.countryCode as 'PL') ?? 'PL',
      addressLine1: buyer.addressLine1 ?? '',
      addressLine2: buyer.addressLine2 ?? '',
    },
    email: buyer.email,
    jst: 2,
    gv: 2,
  };
}

function mapPaymentMethodLabel(raw?: string): PaymentInfo['method'] {
  if (!raw) return 'transfer';
  const x = raw.toLowerCase();
  if (x.includes('gotów') || x === 'cash') return 'cash';
  if (x.includes('kart')) return 'card';
  if (x.includes('przelew')) return 'transfer';
  return 'other';
}

function paymentInfoFromParsed(inv: ParsedInvoice): PaymentInfo {
  return {
    amountDue: inv.totals.grossTotal,
    currency: 'PLN',
    dueDate: inv.paymentDueDate ?? inv.issueDate,
    method: mapPaymentMethodLabel(inv.paymentMethod),
    bankAccount: inv.bankAccount,
  };
}

function buildImportFa3Json(inv: ParsedInvoice, source: string, importJobId: string): Json {
  return {
    import: {
      source,
      importJobId,
      importedAt: new Date().toISOString(),
    },
    parsed: inv,
  } as unknown as Json;
}

function lineVatGross(line: ParsedLine): { vatAmount: number; grossAmount: number } {
  const net = line.netAmount;
  const raw = line.vatRate.trim().toLowerCase();

  if (raw === 'zw' || raw === 'oo' || raw === 'np' || /^0(\s|$|kr|ex|wt)/i.test(raw)) {
    return { vatAmount: 0, grossAmount: round2(net) };
  }

  const pctMatch = raw.match(/^(\d+(?:[\.,]\d+)?)/);
  const pct = pctMatch ? parseFloat(pctMatch[1].replace(',', '.')) : NaN;
  if (!Number.isFinite(pct)) {
    return { vatAmount: 0, grossAmount: round2(net) };
  }

  const vatAmount = round2((net * pct) / 100);
  return { vatAmount, grossAmount: round2(net + vatAmount) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
