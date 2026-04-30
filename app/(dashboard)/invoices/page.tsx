import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { InvoiceList, type InvoiceRow } from '@/components/invoices/invoice-list';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const supabase = await createClient();

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, internal_number, issue_date, buyer_data, gross_total, ksef_status, ksef_number, created_at')
    .eq('direction', 'outgoing')
    .order('created_at', { ascending: false })
    .limit(100);

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
        <InvoiceList initialInvoices={(invoices ?? []) as InvoiceRow[]} />
      )}
    </div>
  );
}
