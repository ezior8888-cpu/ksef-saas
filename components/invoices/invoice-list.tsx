'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, PlusCircle, Upload } from 'lucide-react';

import { InvoicesTable } from '@/app/(dashboard)/invoices/_components/invoices-table';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SelectedPdfDownload } from './batch-pdf-download';
import { SwipeableInvoiceRow } from './swipeable-invoice-row';

import { PAYMENT_FACT_FIELDS, type InvoiceFactsById, type InvoiceRow } from './invoice-row-types';
import { todayInWarsaw } from '@/lib/format/warsaw-date';

export type { InvoiceRow } from './invoice-row-types';

/**
 * Lista faktur z nasłuchem Realtime.
 *
 * Server renderuje początkowy snapshot (stronę listy z filtrami z adresu),
 * a klient subskrybuje kanał `postgres_changes` dla tabeli `invoices`:
 *   - INSERT: doklejamy u góry listy.
 *   - UPDATE: mergujemy pola z `payload.new`.
 *   - DELETE: usuwamy wiersz.
 *
 * Nie pollujemy — po `queued` / `sending` / `accepted` job w tle (pg-boss) aktualizuje
 * `ksef_status` w DB; Supabase pushuje zdarzenie przez WebSocket w <1s.
 *
 * Stan płatności („Opłacona”, „Po terminie”, „Do zapłaty”) jest wyliczany przy
 * renderze z faktów serwera i dat wiersza, nie przechowywany. Zmiana kolumny,
 * od której zależą fakty serwera (`PAYMENT_FACT_FIELDS`), odświeża stronę
 * (`router.refresh()`), żeby fakty przeliczył serwer.
 *
 * RLS na `invoices` zapewnia że klient nie dostanie zdarzeń dla obcych
 * tenantów (policy `invoices_select_own_tenant` + `tenant_id = get_current_tenant_id()`).
 * Dodatkowo `filter` na INSERT/UPDATE ogranicza payload do wierszy tego tenanta
 * (defense-in-depth przy Realtime). DELETE bez filtra — `old` często ma tylko PK
 * (REPLICA IDENTITY), więc filtr `tenant_id` mógłby nie działać; lokalnie i tak
 * usuwamy tylko po `id` obecnym na liście.
 */
export function InvoiceList({
  tenantId,
  initialInvoices,
  filtered = false,
  summary,
  facts = {},
  today,
}: {
  tenantId: string;
  initialInvoices: InvoiceRow[];
  /** Fakty wierszy z `loadInvoiceListRowFacts` (id → fakty); brak = „—” w kolumnach płatności. */
  facts?: InvoiceFactsById;
  /** Dziś w Europe/Warsaw (RRRR-MM-DD) z serwera; domyślnie liczone przy renderze. */
  today?: string;
  /**
   * Lista zawężona filtrem albo dalszą stroną (F-086): nowe faktury z Realtime
   * nie są wtedy doklejane (mogą nie pasować do filtra), a pusty wynik to
   * „brak wyników”, nie „brak faktur”.
   */
  filtered?: boolean;
  /** Opis zakresu pozycji z serwera (np. „1–50 z 230”). */
  summary?: string;
}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const invoicesRef = useRef(invoices);
  useEffect(() => {
    invoicesRef.current = invoices;
  }, [invoices]);
  const dayToday = today ?? todayInWarsaw();

  const toggleRow = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(
    (checked: boolean) => setSelected(checked ? new Set(invoicesRef.current.map((inv) => inv.id)) : new Set()),
    [],
  );
  // Zaznaczenie tylko wierszy, które nadal są na liście (Realtime potrafi je usunąć).
  const selectedIds = useMemo(
    () => invoices.filter((inv) => selected.has(inv.id)).map((inv) => inv.id),
    [invoices, selected],
  );

  useEffect(() => {
    const supabase = createClient();

    const filter = `tenant_id=eq.${tenantId}`;

    const channel = supabase
      .channel(`invoices-realtime:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'invoices',
          filter,
        },
        (payload) => {
          const next = payload.new as Partial<InvoiceRow> & { id: string };
          const current = invoicesRef.current.find((inv) => inv.id === next.id);
          if (
            current &&
            PAYMENT_FACT_FIELDS.some((field) => field in next && String(next[field] ?? '') !== String(current[field] ?? ''))
          ) {
            router.refresh();
          }
          setInvoices((prev) =>
            prev.map((inv) => (inv.id === next.id ? { ...inv, ...next } : inv))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'invoices',
          filter,
        },
        (payload) => {
          const next = payload.new as InvoiceRow;
          if (filtered) return;
          if ((next as unknown as { direction?: string }).direction === 'incoming')
            return;
          setInvoices((prev) => {
            if (prev.some((inv) => inv.id === next.id)) return prev;
            return [next, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'invoices',
        },
        (payload) => {
          const old = payload.old as { id?: string };
          if (!old.id) return;
          setInvoices((prev) => prev.filter((inv) => inv.id !== old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, filtered, router]);

  if (invoices.length === 0 && filtered) {
    return (
      <EmptyState
        icon={FileText}
        title="Brak faktur dla tych filtrów"
        description="Zmień frazę, status albo okres — albo wyczyść filtry."
        primaryAction={{
          type: 'link',
          label: 'Wyczyść filtry',
          href: '/invoices',
          icon: FileText,
        }}
      />
    );
  }

  if (invoices.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Brak faktur wystawionych"
        description="Wystaw pierwszą fakturę albo zaimportuj historię z poprzedniego programu. Migracja CSV z Fakturownia / inFakt / wFirma / iFirma zajmuje 5 minut."
        primaryAction={{
          type: 'link',
          label: 'Wystaw pierwszą fakturę',
          href: '/invoices/new',
          icon: PlusCircle,
        }}
        secondaryAction={{
          type: 'link',
          label: 'Importuj historię',
          href: '/onboarding/import-source',
          icon: Upload,
        }}
      />
    );
  }

  const selectedSet = new Set(selectedIds);

  return (
    <>
      {/* TELEFON (< lg): lista kart ze swipe */}
      <div className="lg:hidden space-y-2">
        {invoices.map((inv) => (
          <SwipeableInvoiceRow key={inv.id} invoice={inv} facts={facts[inv.id]} today={dayToday} />
        ))}
      </div>

      {/* KOMPUTER (lg+): data-table Finory na ui/table */}
      <Card className="hidden gap-0 py-0 shadow-none lg:block">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Lista faktur wystawionych</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {summary ?? `${invoices.length} pozycji • sortowanie wg daty utworzenia`}
            </p>
          </div>
          <SelectedPdfDownload ids={selectedIds} />
        </div>
        <InvoicesTable
          invoices={invoices}
          facts={facts}
          today={dayToday}
          selectedIds={selectedSet}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
        />
      </Card>
    </>
  );
}
