import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getPageContext } from '@/lib/supabase/page-context';
import { InvoicesPullToRefresh } from './_components/invoices-pull-to-refresh';
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
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Faktury wystawione
          </h1>
          <p className="mt-2 text-muted-foreground">
            Wszystkie faktury sprzedażowe wysłane do KSeF
          </p>
        </div>
        <Button asChild variant="glass-primary">
          <Link href="/invoices/new">
            <PlusCircle className="h-4 w-4 mr-2" />
            Nowa faktura
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-400">
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
