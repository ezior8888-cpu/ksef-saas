import { createAdminClient } from '@/lib/supabase/server';
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceType,
  PaymentInfo,
  BuyerParty,
  SellerParty,
  VatRate,
} from '@/types/invoice';

/**
 * Mapowanie wiersza DB → domenowy typ `Invoice` dla renderera PDF
 * (Faza 33 Krok 4).
 *
 * `seller_data` / `buyer_data` / `payment_data` to JSONB zapisywane
 * bezpośrednio jako kształt `SellerParty` / `BuyerParty` / `PaymentInfo`
 * (zob. `lib/import/import-engine.ts`, `lib/billing/self-invoice.ts`)
 * — castujemy 1:1.
 */

export interface InvoicePdfData {
  invoice: Invoice;
  tenantId: string;
  invoiceId: string;
  /** Do budowy klucza R2 (YYYY-MM-DD). */
  issueDate: string;
  ksefNumber: string | null;
  /** Cache: PDF jest ważny gdy pdf_generated_at >= updated_at. */
  updatedAt: string | null;
  pdfStoragePath: string | null;
  pdfGeneratedAt: string | null;
}

interface LineItemRow {
  ordinal: number | null;
  name: string | null;
  unit: string | null;
  quantity: number | null;
  unit_price_net: number | null;
  net_amount: number | null;
  vat_rate: string | null;
  vat_amount: number | null;
  gross_amount: number | null;
}

interface InvoiceRow {
  id: string;
  tenant_id: string;
  internal_number: string | null;
  invoice_type: string | null;
  issue_date: string;
  sale_date: string | null;
  ksef_number: string | null;
  net_total: number | null;
  vat_total: number | null;
  gross_total: number | null;
  notes: string | null;
  updated_at: string | null;
  pdf_storage_path: string | null;
  pdf_generated_at: string | null;
  seller_data: unknown;
  buyer_data: unknown;
  payment_data: unknown;
  invoice_line_items: LineItemRow[] | null;
}

const SELECT = `
  id, tenant_id, internal_number, invoice_type, issue_date, sale_date,
  ksef_number, net_total, vat_total, gross_total, notes, updated_at,
  pdf_storage_path, pdf_generated_at, seller_data, buyer_data, payment_data,
  invoice_line_items(
    ordinal, name, unit, quantity, unit_price_net,
    net_amount, vat_rate, vat_amount, gross_amount
  )
`;

const KNOWN_TYPES: ReadonlySet<string> = new Set<InvoiceType>([
  'VAT',
  'KOR',
  'ZAL',
  'ROZ',
  'UPR',
  'KOR_ZAL',
  'KOR_ROZ',
]);

function mapLine(row: LineItemRow): InvoiceLineItem {
  return {
    ordinal: row.ordinal ?? 0,
    name: row.name ?? '',
    unit: row.unit ?? 'szt',
    quantity: Number(row.quantity ?? 0),
    unitPriceNet: Number(row.unit_price_net ?? 0),
    netAmount: Number(row.net_amount ?? 0),
    vatRate: (row.vat_rate as VatRate | null) ?? '23',
    vatAmount: Number(row.vat_amount ?? 0),
    grossAmount: Number(row.gross_amount ?? 0),
  };
}

/**
 * Ładuje fakturę z DB i mapuje do `Invoice`. Zwraca `null` gdy nie istnieje.
 * Weryfikację tenanta (ownership) robi caller — tu zwracamy `tenantId`.
 */
export async function loadInvoiceForPdf(
  invoiceId: string,
): Promise<InvoicePdfData | null> {
  const admin = createAdminClient();
  const res = await (
    admin as unknown as {
      from: (n: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{
              data: InvoiceRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from('invoices')
    .select(SELECT)
    .eq('id', invoiceId)
    .maybeSingle();

  if (res.error || !res.data) return null;
  const row = res.data;

  const lines = (row.invoice_line_items ?? [])
    .map(mapLine)
    .sort((a, b) => a.ordinal - b.ordinal);

  const rawType = (row.invoice_type ?? 'VAT').toUpperCase();
  const type: InvoiceType = KNOWN_TYPES.has(rawType)
    ? (rawType as InvoiceType)
    : 'VAT';

  const invoice: Invoice = {
    internalNumber: row.internal_number ?? row.id.slice(0, 8),
    type,
    issueDate: row.issue_date,
    saleDate: row.sale_date ?? undefined,
    seller: row.seller_data as SellerParty,
    buyer: row.buyer_data as BuyerParty,
    lines,
    netTotal: Number(row.net_total ?? 0),
    vatTotal: Number(row.vat_total ?? 0),
    grossTotal: Number(row.gross_total ?? 0),
    payment: row.payment_data as PaymentInfo,
    notes: row.notes ?? undefined,
  };

  return {
    invoice,
    tenantId: row.tenant_id,
    invoiceId: row.id,
    issueDate: row.issue_date,
    ksefNumber: row.ksef_number,
    updatedAt: row.updated_at,
    pdfStoragePath: row.pdf_storage_path,
    pdfGeneratedAt: row.pdf_generated_at,
  };
}

/** Zapisuje ścieżkę PDF + timestamp po wygenerowaniu (cache). */
export async function saveInvoicePdfPath(
  invoiceId: string,
  storagePath: string,
): Promise<void> {
  const admin = createAdminClient();
  await (
    admin as unknown as {
      from: (n: string) => {
        update: (p: Record<string, unknown>) => {
          eq: (k: string, v: string) => Promise<{ error: unknown }>;
        };
      };
    }
  )
    .from('invoices')
    .update({
      pdf_storage_path: storagePath,
      pdf_generated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);
}
