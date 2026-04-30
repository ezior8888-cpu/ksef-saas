import { Inbox } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type InboxRow = {
  id: string;
  ksef_number: string | null;
  issue_date: string | null;
  seller_nip: string | null;
  seller_data: unknown;
  fa3_data: unknown;
  gross_total: string | number | null;
  currency: string | null;
  ksef_accepted_at: string | null;
};

function sellerDisplay(row: InboxRow): { name: string; nip: string } {
  const sd = row.seller_data as { name?: string; nip?: string } | null;
  const fa3 = row.fa3_data as { seller?: { name?: string; nip?: string } } | null;
  const name = sd?.name?.trim() || fa3?.seller?.name?.trim() || '—';
  const nip = sd?.nip?.trim() || fa3?.seller?.nip?.trim() || row.seller_nip?.trim() || '—';
  return { name, nip };
}

export default async function InboxPage() {
  const supabase = await createClient();

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, ksef_number, issue_date, seller_nip, seller_data, fa3_data, gross_total, currency, ksef_accepted_at')
    .eq('direction', 'incoming')
    .order('ksef_accepted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (invoices ?? []) as InboxRow[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">
          Skrzynka odbiorcza
        </h1>
        <p className="mt-2 text-muted-foreground">
          Faktury zakupowe pobrane z KSeF (aktualizowane co 15 minut)
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-400">
          Nie udało się pobrać faktur: {error.message}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] py-16 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/5 mb-4">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg tracking-tight mb-1">
            Brak faktur przychodzących
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Otrzymane faktury pojawią się tutaj automatycznie
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-foreground/[0.03] border-b border-white/55 dark:border-white/14">
              <tr className="text-left">
                {['Data otrzymania', 'Numer KSeF', 'Sprzedawca', 'Kwota brutto'].map((h) => (
                  <th key={h} className="px-6 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => {
                const seller = sellerDisplay(inv);
                const cur = inv.currency?.trim() || 'PLN';
                return (
                  <tr
                    key={inv.id}
                    className="border-b border-white/55 dark:border-white/[0.07] last:border-0 hover:bg-foreground/[0.02] transition-colors duration-150"
                  >
                    <td className="px-6 py-4 text-muted-foreground tabular-nums">
                      {inv.ksef_accepted_at
                        ? new Date(inv.ksef_accepted_at).toLocaleString('pl-PL', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                      {inv.ksef_number ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{seller.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{seller.nip}</div>
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums font-medium">
                      {Number(inv.gross_total ?? 0).toFixed(2)} {cur}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
