import { notFound } from 'next/navigation';

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
      internal_number,
      invoice_type,
      issue_date,
      sale_date,
      ksef_status,
      ksef_number,
      ksef_accepted_at,
      xml_storage_path,
      net_total,
      vat_total,
      gross_total,
      notes,
      last_error,
      last_error_code,
      last_error_field,
      last_error_suggestion,
      seller_data,
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

  const { data: upo } = await supabase
    .from('upo_receipts')
    .select('status')
    .eq('invoice_id', id)
    .maybeSingle();

  const lines = ((invoice.invoice_line_items ?? []) as InvoiceDetailLine[])
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal);

  const initial: InvoiceDetailInitial = {
    id: invoice.id as string,
    internal_number: (invoice.internal_number as string | null) ?? null,
    invoice_type: (invoice.invoice_type as string | null) ?? null,
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
    lines,
    upo_status:
      upo?.status ??
      null,
  };

  return <InvoiceDetailView key={initial.id} initial={initial} />;
}
