'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from './status-badge';

export interface InvoiceRow {
  id: string;
  internal_number: string | null;
  issue_date: string | null;
  buyer_data: {
    nip?: string;
    name?: string;
  } | null;
  gross_total: string | number | null;
  ksef_status: string;
  ksef_number: string | null;
  created_at: string;
}

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
 */
export function InvoiceList({
  initialInvoices,
}: {
  initialInvoices: InvoiceRow[];
}) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('invoices-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'invoices',
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
        },
        (payload) => {
          const next = payload.new as InvoiceRow;
          // Lista jest filtrowana po direction='outgoing' - pomiń incoming.
          if ((next as unknown as { direction?: string }).direction === 'incoming') {
            return;
          }
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
  }, []);

  if (invoices.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-gray-500">
        <p className="mb-2">Nie masz jeszcze żadnej wystawionej faktury.</p>
        <Link
          href="/invoices/new"
          className="text-blue-600 hover:underline"
        >
          Wystaw pierwszą fakturę →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr className="text-left">
            <th className="px-4 py-3 font-medium">Numer</th>
            <th className="px-4 py-3 font-medium">Data</th>
            <th className="px-4 py-3 font-medium">Nabywca</th>
            <th className="px-4 py-3 font-medium text-right">Kwota brutto</th>
            <th className="px-4 py-3 font-medium">Status KSeF</th>
            <th className="px-4 py-3 font-medium">Numer KSeF</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              className="border-b last:border-b-0 hover:bg-gray-50"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/invoices/${inv.id}`}
                  className="font-medium hover:underline"
                >
                  {inv.internal_number ?? '(bez numeru)'}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-600 tabular-nums">
                {inv.issue_date ?? '—'}
              </td>
              <td className="px-4 py-3">
                <div>{inv.buyer_data?.name ?? '—'}</div>
                {inv.buyer_data?.nip && (
                  <div className="text-xs text-gray-500">
                    NIP: {inv.buyer_data.nip}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {inv.gross_total != null
                  ? `${Number(inv.gross_total).toFixed(2)} PLN`
                  : '—'}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={inv.ksef_status} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-gray-600">
                {inv.ksef_number ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
