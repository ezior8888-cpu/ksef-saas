'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, ArrowRight, PlusCircle, Upload } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from './status-badge';
import { SwipeableInvoiceRow } from './swipeable-invoice-row';

import type { InvoiceRow } from './invoice-row-types';

export type { InvoiceRow } from './invoice-row-types';

/**
 * Lista faktur z nasłuchem Realtime.
 *
 * Server renderuje początkowy snapshot (pierwsze 100 faktur tenanta),
 * a klient subskrybuje kanał `postgres_changes` dla tabeli `invoices`:
 *   - INSERT: doklejamy u góry listy.
 *   - UPDATE: mergujemy pola z `payload.new`.
 *   - DELETE: usuwamy wiersz.
 *
 * Nie pollujemy — po `queued` / `sending` / `accepted` job Inngest aktualizuje
 * `ksef_status` w DB; Supabase pushuje zdarzenie przez WebSocket w <1s.
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
}: {
  tenantId: string;
  initialInvoices: InvoiceRow[];
}) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);

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
  }, [tenantId]);

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

  return (
    <>
      {/* MOBILE: lista kart ze swipe */}
      <div className="lg:hidden space-y-2">
        {invoices.map((inv) => (
          <SwipeableInvoiceRow key={inv.id} invoice={inv} />
        ))}
      </div>

      {/* DESKTOP: tabela (jak było) */}
      <div className="hidden lg:block overflow-hidden rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-foreground/[0.03] border-b border-white/55 dark:border-white/14">
              <tr className="text-left">
                {['Numer', 'Data', 'Nabywca', 'Kwota brutto', 'Status KSeF', 'Numer KSeF'].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-white/55 dark:border-white/[0.07] last:border-0 hover:bg-foreground/[0.02] transition-colors duration-150"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-medium font-mono text-sm hover:text-foreground/60 transition-colors"
                    >
                      {inv.internal_number ?? '(bez numeru)'}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground tabular-nums">
                    {inv.issue_date ?? '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{inv.buyer_data?.name ?? '—'}</div>
                    {inv.buyer_data?.nip && (
                      <div className="text-xs text-muted-foreground font-mono">
                        {inv.buyer_data.nip}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums font-medium">
                    {inv.gross_total != null
                      ? `${Number(inv.gross_total).toFixed(2)} PLN`
                      : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={inv.ksef_status} />
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                    {inv.ksef_number ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
