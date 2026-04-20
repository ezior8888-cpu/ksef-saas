import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import {
  InvoiceList,
  type InvoiceRow,
} from '@/components/invoices/invoice-list';

export const dynamic = 'force-dynamic';

/**
 * Lista faktur wystawionych. SSR renderuje initial snapshot, klient
 * podtrzymuje listę aktualną przez Supabase Realtime (invoice-list.tsx).
 *
 * Filtrujemy po `direction='outgoing'` (schema 00001 CHECK). Faktury
 * `incoming` mają osobną stronę `/inbox` (Faza 7).
 */
export default async function InvoicesPage() {
  const supabase = await createClient();

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(
      'id, internal_number, issue_date, buyer_data, gross_total, ksef_status, ksef_number, created_at'
    )
    .eq('direction', 'outgoing')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Faktury wystawione</h1>
          <p className="text-sm text-gray-500 mt-1">
            Status KSeF aktualizuje się automatycznie po wysyłce.
          </p>
        </div>
        <Button asChild>
          <Link href="/invoices/new">
            <PlusCircle className="h-4 w-4 mr-2" />
            Nowa faktura
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Nie udało się pobrać faktur: {error.message}
        </div>
      ) : (
        <InvoiceList initialInvoices={(invoices ?? []) as InvoiceRow[]} />
      )}
    </div>
  );
}
