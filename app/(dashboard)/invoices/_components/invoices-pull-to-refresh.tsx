'use client';

import { useRouter } from 'next/navigation';

import { InvoiceList } from '@/components/invoices/invoice-list';
import { PullToRefresh } from '@/components/pwa/pull-to-refresh';

import type { InvoiceRow } from '@/components/invoices/invoice-row-types';

export function InvoicesPullToRefresh({
  tenantId,
  initialInvoices,
  listKey,
}: {
  tenantId: string;
  initialInvoices: InvoiceRow[];
  /** Unikalny fingerprint listy z serwera — zmiana po `router.refresh()` remountuje listę. */
  listKey: string;
}) {
  const router = useRouter();

  return (
    <PullToRefresh onRefresh={async () => router.refresh()}>
      <InvoiceList
        key={listKey}
        tenantId={tenantId}
        initialInvoices={initialInvoices}
      />
    </PullToRefresh>
  );
}
