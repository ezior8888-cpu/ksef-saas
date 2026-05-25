import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getPageContext } from '@/lib/supabase/page-context';
import { InvoicesPullToRefresh } from './_components/invoices-pull-to-refresh';
import { BatchPdfDownload } from '@/components/invoices/batch-pdf-download';
import type { InvoiceRow } from '@/components/invoices/invoice-row-types';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const { supabase, tenantId } = await getPageContext();

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(
      'id, internal_number, issue_date, buyer_data, gross_total, ksef_status, ksef_number, created_at, xml_storage_path'
    )
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (invoices ?? []) as InvoiceRow[];
  const listKey = rows
    .map(
      (row) =>
        `${row.id}:${row.ksef_status}:${String(row.internal_number ?? '')}:${String(row.ksef_number ?? '')}:${String(row.xml_storage_path ?? '')}`
    )
    .join('|');

  return (
    <div className="space-y-8 pb-10 text-[var(--ff-on-surface)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[40px] font-bold leading-[1.2] tracking-[-0.02em]">
            Faktury wystawione
          </h1>
          <p className="text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
            Wszystkie faktury sprzedażowe wysłane do KSeF
          </p>
        </div>
        <div className="flex items-end gap-3">
          <BatchPdfDownload />
          <Button asChild variant="glass-primary">
            <Link href="/invoices/new">
              <PlusCircle className="h-4 w-4 mr-2" />
              Nowa faktura
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-[var(--ff-radius-lg)] border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-200">
          Nie udało się pobrać faktur: {error.message}
        </div>
      ) : (
        <InvoicesPullToRefresh
          tenantId={tenantId}
          listKey={listKey}
          initialInvoices={rows}
        />
      )}
    </div>
  );
}
