'use client';

import { useRouter } from 'next/navigation';

import { InvoiceList } from '@/components/invoices/invoice-list';
import { PullToRefresh } from '@/components/pwa/pull-to-refresh';

import type { InvoiceFactsById, InvoiceRow } from '@/components/invoices/invoice-row-types';

/**
 * Lista bez klucza z danych: Realtime zmienia dane widocznego wiersza →
 * `router.refresh()` → nowy snapshot. Remont listy kasowałby zaznaczenie
 * i otwarte okna wierszy, więc `InvoiceList` bierze snapshot z
 * `initialInvoices` bez remontu.
 */
export function InvoicesPullToRefresh({
  tenantId,
  initialInvoices,
  filtered = false,
  summary,
  facts,
  today,
}: {
  tenantId: string;
  initialInvoices: InvoiceRow[];
  /** Lista zawężona filtrem albo dalszą stroną (F-086). */
  filtered?: boolean;
  /** Opis zakresu pozycji pod nagłówkiem tabeli. */
  summary?: string;
  /** Fakty płatności wierszy z serwera (id → fakty). */
  facts?: InvoiceFactsById;
  /** Dziś w Europe/Warsaw (RRRR-MM-DD). */
  today?: string;
}) {
  const router = useRouter();

  return (
    <PullToRefresh onRefresh={async () => router.refresh()}>
      <InvoiceList
        tenantId={tenantId}
        initialInvoices={initialInvoices}
        filtered={filtered}
        summary={summary}
        facts={facts}
        today={today}
      />
    </PullToRefresh>
  );
}
