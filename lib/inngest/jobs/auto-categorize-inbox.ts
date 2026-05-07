/**
 * Po zapisaniu faktury przychodzącej z inbox KSeF — tworzymy `expenses` z kategoryzacją KPiR.
 */

import { NonRetriableError } from 'inngest';

import { categorizeExpense } from '@/lib/categorization';
import {
  extractedInvoiceSchema,
  type ExtractedInvoice,
} from '@/lib/ocr/schema';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/types/database';

import { inboxInvoiceReceivedAutoCategorize, inngest } from '../client';

type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
type LineItemRow = Database['public']['Tables']['invoice_line_items']['Row'];

type InvoiceWithLines = InvoiceRow & {
  invoice_line_items: LineItemRow[] | null;
};

function readSellerFromFa3(fa3: Json): { name?: string; nip?: string } {
  if (!fa3 || typeof fa3 !== 'object' || Array.isArray(fa3)) {
    return {};
  }
  const seller = (fa3 as Record<string, unknown>).seller;
  if (!seller || typeof seller !== 'object' || Array.isArray(seller)) {
    return {};
  }
  const s = seller as Record<string, unknown>;
  const name = typeof s.name === 'string' ? s.name : undefined;
  const nip = typeof s.nip === 'string' ? s.nip : undefined;
  return { name, nip };
}

function readSellerFromSellerData(data: Json | null): { name?: string; nip?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  const o = data as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name : undefined;
  const nip = typeof o.nip === 'string' ? o.nip : undefined;
  return { name, nip };
}

function normalizeNip10(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? digits : null;
}

function resolveSellerName(invoice: InvoiceWithLines): string {
  const fromRow = readSellerFromSellerData(invoice.seller_data);
  if (fromRow.name) return fromRow.name;
  const fromFa3 = readSellerFromFa3(invoice.fa3_data);
  if (fromFa3.name) return fromFa3.name;
  return 'Nieznany';
}

function resolveSellerNip(invoice: InvoiceWithLines): string | null {
  const fromColumn = normalizeNip10(invoice.seller_nip);
  if (fromColumn) return fromColumn;
  const fromRow = normalizeNip10(readSellerFromSellerData(invoice.seller_data).nip ?? null);
  if (fromRow) return fromRow;
  return normalizeNip10(readSellerFromFa3(invoice.fa3_data).nip ?? null);
}

function inferVatRate(invoice: InvoiceWithLines): ExtractedInvoice['vat_rate'] {
  const lines = invoice.invoice_line_items ?? [];
  const rates = [
    ...new Set(
      lines
        .map((l) => l.vat_rate)
        .filter((r): r is string => typeof r === 'string' && r.length > 0),
    ),
  ];

  if (rates.length > 1) return 'mixed';
  if (rates.length === 1) {
    const r = rates[0];
    if (
      r === '23' ||
      r === '8' ||
      r === '5' ||
      r === '0' ||
      r === 'zw' ||
      r === 'oo' ||
      r === 'np' ||
      r === 'mixed'
    ) {
      return r;
    }
  }

  const net = Number(invoice.net_total ?? 0);
  const vat = Number(invoice.vat_total ?? 0);
  if (net <= 0 && vat <= 0) return '0';
  if (vat <= 0) return '0';
  const ratio = vat / net;
  if (ratio >= 0.22 && ratio <= 0.24) return '23';
  if (ratio >= 0.07 && ratio <= 0.09) return '8';
  if (ratio >= 0.04 && ratio <= 0.06) return '5';
  return 'mixed';
}

function buildLineItems(
  lines: LineItemRow[] | null,
): ExtractedInvoice['line_items'] {
  if (!lines?.length) return null;
  return lines.map((l) => ({
    name: l.name?.trim() ? l.name : 'Pozycja',
    quantity: l.quantity != null ? Number(l.quantity) : null,
    unit_price: l.unit_price_net != null ? Number(l.unit_price_net) : null,
    gross: l.gross_amount != null ? Number(l.gross_amount) : null,
  }));
}

function invoiceToExtracted(invoice: InvoiceWithLines): ExtractedInvoice {
  const gross = Number(invoice.gross_total ?? 0);
  const net = Number(invoice.net_total ?? 0);
  const vat = Number(invoice.vat_total ?? 0);

  if (!(gross > 0)) {
    throw new NonRetriableError('Brak dodatniej kwoty brutto — pomijam expense');
  }

  const docNo =
    invoice.internal_number?.trim() ||
    invoice.ksef_number?.trim() ||
    'brak';

  const draft = {
    seller_name: resolveSellerName(invoice),
    seller_nip: resolveSellerNip(invoice),
    seller_address: null,
    document_number: docNo,
    document_type: 'invoice' as const,
    issue_date: invoice.issue_date,
    net_amount: net,
    vat_amount: vat,
    gross_amount: gross,
    vat_rate: inferVatRate(invoice),
    line_items: buildLineItems(invoice.invoice_line_items),
    ocr_confidence: 1,
    notes: null,
  };

  return extractedInvoiceSchema.parse(draft);
}

export const autoCategorizeInboxInvoice = inngest.createFunction(
  {
    id: 'auto-categorize-inbox',
    name: 'KPiR: expense z faktury inbox KSeF',
    retries: 2,
    concurrency: { limit: 10 },
    triggers: [inboxInvoiceReceivedAutoCategorize],
  },
  async ({ event, step }) => {
    const { invoiceId, tenantId } = inboxInvoiceReceivedAutoCategorize.parse(
      event.data,
    );
    const supabase = createAdminClient();

    const extracted = await step.run('fetch-invoice', async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(
          `
          id,
          tenant_id,
          direction,
          ksef_number,
          internal_number,
          issue_date,
          seller_data,
          seller_nip,
          gross_total,
          net_total,
          vat_total,
          fa3_data,
          invoice_line_items (*)
        `,
        )
        .eq('id', invoiceId)
        .single();

      if (error || !data) {
        throw new NonRetriableError('Faktura nie istnieje');
      }

      const row = data as InvoiceWithLines;

      if (row.tenant_id !== tenantId) {
        throw new NonRetriableError('Niezgodność tenanta');
      }
      if (row.direction !== 'incoming') {
        throw new NonRetriableError('Tylko faktury incoming z inbox');
      }

      return invoiceToExtracted(row);
    });

    const categorization = await step.run('categorize', async () => {
      return categorizeExpense(tenantId, extracted);
    });

    await step.run('create-expense', async () => {
      const { data: existing } = await supabase
        .from('expenses')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('ksef_invoice_id', invoiceId)
        .maybeSingle();

      if (existing) {
        return { skipped: true as const, expenseId: existing.id };
      }

      const { data: ownerMembership } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('organization_id', tenantId)
        .eq('role', 'owner')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      let createdById = ownerMembership?.user_id;
      if (!createdById) {
        const { data: anyMembership } = await supabase
          .from('memberships')
          .select('user_id')
          .eq('organization_id', tenantId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        createdById = anyMembership?.user_id;
      }

      if (!createdById) {
        throw new NonRetriableError('Brak użytkownika w tenancie — nie tworzę expense');
      }

      const { data: expense, error } = await supabase
        .from('expenses')
        .insert({
          tenant_id: tenantId,
          created_by: createdById,
          source: 'ksef_inbox',
          ksef_invoice_id: invoiceId,
          seller_name: extracted.seller_name,
          seller_nip: extracted.seller_nip,
          document_number: extracted.document_number,
          document_type: 'invoice',
          issue_date: extracted.issue_date,
          net_amount: extracted.net_amount,
          vat_amount: extracted.vat_amount,
          gross_amount: extracted.gross_amount,
          vat_rate: extracted.vat_rate,
          vat_deductible_amount: extracted.vat_amount,
          kpir_column: categorization.kpir_column,
          category_label: categorization.category_label,
          categorization_method: categorization.method,
          categorization_confidence: categorization.confidence,
          is_reviewed: categorization.confidence > 0.9,
        })
        .select('id')
        .single();

      if (error || !expense) {
        throw new Error(error?.message ?? 'Insert expense failed');
      }

      return { skipped: false as const, expenseId: expense.id };
    });

    return { success: true as const };
  },
);
