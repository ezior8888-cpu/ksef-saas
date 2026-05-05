// lib/exports/data-fetcher.ts
// Pobieranie danych z DB do eksportów (uniform interface)

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/types/database';

import type { JpkFaInputData, JpkInvoice, JpkInvoiceLine } from './jpk-fa-generator';

type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
type LineItemRow = Database['public']['Tables']['invoice_line_items']['Row'];

export interface FetchInvoicesParams {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  direction: 'issued' | 'received' | 'both';
  includeCorrections?: boolean;
}

export interface FetchedInvoiceData {
  issuer: JpkFaInputData['issuer'];
  issuedInvoices: JpkInvoice[];
  receivedInvoices: JpkInvoice[];
}

export async function fetchInvoicesForExport(
  params: FetchInvoicesParams,
): Promise<FetchedInvoiceData> {
  const supabase = createAdminClient();

  const needIssued =
    params.direction === 'issued' || params.direction === 'both';
  const needReceived =
    params.direction === 'received' || params.direction === 'both';

  // Trzy zapytania niezależne od siebie — odpalane równolegle.
  // Wcześniej szły sekwencyjnie (tenant → issued → received), co dla okresu
  // miesięcznego dawało 3 round-tripy do Postgresa. Promise.all ścina to do 1.
  const [tenantResult, issuedRows, receivedRows] = await Promise.all([
    supabase
      .from('tenants')
      .select('nip, name, address_json')
      .eq('id', params.tenantId)
      .single(),
    needIssued
      ? fetchInvoiceRows(supabase, {
          tenantId: params.tenantId,
          direction: 'issued',
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          includeCorrections: params.includeCorrections,
        })
      : Promise.resolve<InvoiceRow[]>([]),
    needReceived
      ? fetchInvoiceRows(supabase, {
          tenantId: params.tenantId,
          direction: 'received',
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          includeCorrections: params.includeCorrections,
        })
      : Promise.resolve<InvoiceRow[]>([]),
  ]);

  if (tenantResult.error || !tenantResult.data) {
    throw new Error('Tenant not found');
  }

  const issuer: JpkFaInputData['issuer'] = {
    nip: tenantResult.data.nip ?? '',
    name: tenantResult.data.name ?? '',
    address: parseIssuerAddress(tenantResult.data.address_json),
  };

  // Mapowanie rows → JpkInvoice też idzie równolegle dla obu kierunków
  // (każde robi swoje SELECT-y na liniach + parentach).
  const [issuedInvoices, receivedInvoices] = await Promise.all([
    mapRowsToJpkInvoices(supabase, issuedRows),
    mapRowsToJpkInvoices(supabase, receivedRows),
  ]);

  return { issuer, issuedInvoices, receivedInvoices };
}

async function fetchInvoiceRows(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    tenantId: string;
    direction: 'issued' | 'received';
    periodStart: string;
    periodEnd: string;
    includeCorrections?: boolean;
  },
): Promise<InvoiceRow[]> {
  let query = supabase
    .from('invoices')
    .select('*')
    .eq('tenant_id', params.tenantId)
    .eq('direction', params.direction)
    .eq('ksef_status', 'accepted')
    .gte('issue_date', params.periodStart)
    .lte('issue_date', params.periodEnd)
    .order('issue_date', { ascending: true });

  if (params.includeCorrections === false) {
    query = query.eq('invoice_kind', 'regular');
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceRow[];
}

// ============================================================================
// Mapping: DB rows → JpkInvoice
// ============================================================================

async function mapRowsToJpkInvoices(
  supabase: ReturnType<typeof createAdminClient>,
  rows: InvoiceRow[],
): Promise<JpkInvoice[]> {
  if (rows.length === 0) return [];

  // Parents (numery faktur korygowanych) i linie pozycji są niezależne —
  // jeden SELECT po `invoices`, drugi po `invoice_line_items`. Promise.all
  // ścina latencję per direction o ~50% przy paczkach miesięcznych.
  const [parentNumberById, linesByInvoiceId] = await Promise.all([
    fetchParentInvoiceNumbers(supabase, rows),
    resolveLinesForInvoices(supabase, rows),
  ]);

  return rows.map((row) =>
    mapInvoiceRow(row, linesByInvoiceId.get(row.id) ?? [], parentNumberById),
  );
}

async function fetchParentInvoiceNumbers(
  supabase: ReturnType<typeof createAdminClient>,
  rows: InvoiceRow[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      rows
        .map((r) => r.parent_invoice_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from('invoices')
    .select('id, internal_number, ksef_number')
    .in('id', ids);

  if (error) throw new Error(error.message);

  for (const p of data ?? []) {
    map.set(p.id, p.internal_number ?? p.ksef_number ?? '');
  }
  return map;
}

async function resolveLinesForInvoices(
  supabase: ReturnType<typeof createAdminClient>,
  rows: InvoiceRow[],
): Promise<Map<string, JpkInvoiceLine[]>> {
  const byId = new Map<string, JpkInvoiceLine[]>();
  const missingIds: string[] = [];

  for (const row of rows) {
    const fromFa = linesFromFa3Data(row.fa3_data);
    if (fromFa.length > 0) {
      byId.set(row.id, fromFa);
    } else {
      missingIds.push(row.id);
    }
  }

  if (missingIds.length > 0) {
    const { data: dbLines, error } = await supabase
      .from('invoice_line_items')
      .select(
        'invoice_id, ordinal, name, unit, quantity, unit_price_net, net_amount, vat_rate',
      )
      .in('invoice_id', missingIds)
      .order('ordinal', { ascending: true });

    if (error) throw new Error(error.message);

    const grouped = new Map<string, LineItemRow[]>();
    for (const item of dbLines ?? []) {
      const list = grouped.get(item.invoice_id) ?? [];
      list.push(item as LineItemRow);
      grouped.set(item.invoice_id, list);
    }

    for (const id of missingIds) {
      const list = grouped.get(id) ?? [];
      byId.set(
        id,
        list.map((item) => mapDbLineItemToJpk(item)),
      );
    }
  }

  return byId;
}

function mapInvoiceRow(
  row: InvoiceRow,
  lines: JpkInvoiceLine[],
  parentNumberById: Map<string, string>,
): JpkInvoice {
  const buyerData = readBuyerDataJson(row.buyer_data);
  const nipFromJson =
    typeof buyerData.nip === 'string' ? buyerData.nip.trim() : undefined;
  const buyerNip = nipFromJson || row.buyer_nip?.trim() || undefined;

  let correctedNumber: string | undefined;
  if (row.invoice_kind === 'correction' && row.parent_invoice_id) {
    correctedNumber =
      parentNumberById.get(row.parent_invoice_id) ?? undefined;
  }

  return {
    invoiceNumber: row.internal_number ?? row.ksef_number ?? '',
    invoiceType: mapInvoiceKind(row.invoice_kind),
    issueDate: row.issue_date,
    saleDate: row.sale_date ?? row.issue_date,
    paymentDueDate: row.payment_due_date ?? undefined,

    buyerNip,
    buyerName: buyerData.name ?? '',
    buyerAddress: formatBuyerAddress(buyerData),

    netTotal: Number(row.net_total ?? 0),
    vatTotal: Number(row.vat_total ?? 0),
    grossTotal: Number(row.gross_total ?? 0),

    lines,

    correctedInvoiceNumber: correctedNumber,
    correctionReason: row.correction_reason ?? undefined,
    ksefNumber: row.ksef_number ?? undefined,
  };
}

function mapInvoiceKind(
  kind: InvoiceRow['invoice_kind'],
): JpkInvoice['invoiceType'] {
  switch (kind) {
    case 'correction':
      return 'correction';
    case 'advance':
      return 'advance';
    case 'final':
      return 'final';
    default:
      return 'regular';
  }
}

function mapDbLineItemToJpk(item: LineItemRow): JpkInvoiceLine {
  return {
    position: item.ordinal,
    name: item.name ?? '',
    unit: item.unit ?? 'szt.',
    quantity: Number(item.quantity ?? 1),
    unitPriceNet: Number(item.unit_price_net ?? 0),
    netAmount: Number(item.net_amount ?? 0),
    vatRate: String(item.vat_rate ?? '23'),
  };
}

function linesFromFa3Data(fa3: Json | null): JpkInvoiceLine[] {
  if (!fa3 || typeof fa3 !== 'object' || Array.isArray(fa3)) return [];
  const rawLines = (fa3 as Record<string, unknown>).lines;
  if (!Array.isArray(rawLines)) return [];

  const out: JpkInvoiceLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line || typeof line !== 'object' || Array.isArray(line)) continue;
    const o = line as Record<string, unknown>;
    out.push({
      position:
        typeof o.ordinal === 'number' && Number.isFinite(o.ordinal)
          ? o.ordinal
          : i + 1,
      name: typeof o.name === 'string' ? o.name : '',
      unit: typeof o.unit === 'string' ? o.unit : 'szt.',
      quantity:
        typeof o.quantity === 'number' && Number.isFinite(o.quantity)
          ? o.quantity
          : Number(o.quantity) || 1,
      unitPriceNet:
        typeof o.unitPriceNet === 'number' && Number.isFinite(o.unitPriceNet)
          ? o.unitPriceNet
          : Number(o.unitPriceNet) || 0,
      netAmount:
        typeof o.netAmount === 'number' && Number.isFinite(o.netAmount)
          ? o.netAmount
          : Number(o.netAmount) || 0,
      vatRate: String(o.vatRate ?? '23'),
    });
  }
  return out;
}

interface BuyerDataJson {
  name?: string;
  nip?: string;
  address?: {
    addressLine1?: string;
    addressLine2?: string;
  };
  addressLine1?: string;
  addressLine2?: string;
}

function readBuyerDataJson(json: Json | null): BuyerDataJson {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return {};
  }
  return json as BuyerDataJson;
}

// ============================================================================
// Helpers
// ============================================================================

function parseIssuerAddress(
  json: Json | null,
): JpkFaInputData['issuer']['address'] | undefined {
  if (!json) return undefined;

  if (typeof json === 'string') {
    const t = json.trim();
    return t ? { street: t, country: 'PL' } : undefined;
  }

  if (typeof json !== 'object' || Array.isArray(json)) return undefined;

  const a = json as Record<string, unknown>;
  const countryCode =
    typeof a.countryCode === 'string'
      ? a.countryCode.slice(0, 2).toUpperCase()
      : 'PL';
  const line1 =
    typeof a.addressLine1 === 'string' ? a.addressLine1 : undefined;
  const line2 =
    typeof a.addressLine2 === 'string' ? a.addressLine2 : undefined;

  let postCode: string | undefined;
  let city: string | undefined;
  if (line2) {
    const m = /^(\d{2}-\d{3})\s+(.+)$/.exec(line2.trim());
    if (m) {
      postCode = m[1];
      city = m[2].trim();
    } else {
      city = line2.trim();
    }
  }

  return {
    country: countryCode,
    street: line1,
    city,
    postCode,
  };
}

function formatBuyerAddress(buyerData: BuyerDataJson): string {
  const nested = buyerData.address;
  if (nested && (nested.addressLine1 || nested.addressLine2)) {
    return [nested.addressLine1, nested.addressLine2].filter(Boolean).join(', ');
  }
  if (buyerData.addressLine1 || buyerData.addressLine2) {
    return [buyerData.addressLine1, buyerData.addressLine2]
      .filter(Boolean)
      .join(', ');
  }
  return '';
}
