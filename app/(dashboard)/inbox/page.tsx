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
  const name =
    sd?.name?.trim() ||
    fa3?.seller?.name?.trim() ||
    '—';
  const nip =
    sd?.nip?.trim() ||
    fa3?.seller?.nip?.trim() ||
    row.seller_nip?.trim() ||
    '—';
  return { name, nip };
}

export default async function InboxPage() {
  const supabase = await createClient();

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(
      'id, ksef_number, issue_date, seller_nip, seller_data, fa3_data, gross_total, currency, ksef_accepted_at'
    )
    .eq('direction', 'incoming')
    .order('ksef_accepted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Skrzynka odbiorcza</h1>
      <p className="text-sm text-gray-500 mb-6">
        Faktury zakupowe pobrane z KSeF (aktualizowane co ok. 15 minut przez
        zadanie w tle).
      </p>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Nie udało się pobrać faktur: {error.message}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Data przyjęcia</th>
                <th className="px-4 py-3 font-medium">Numer KSeF</th>
                <th className="px-4 py-3 font-medium">Sprzedawca</th>
                <th className="px-4 py-3 font-medium text-right">Kwota brutto</th>
              </tr>
            </thead>
            <tbody>
              {(invoices as InboxRow[] | null)?.length ? (
                (invoices as InboxRow[]).map((inv) => {
                  const seller = sellerDisplay(inv);
                  const cur = inv.currency?.trim() || 'PLN';
                  return (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">
                        {inv.ksef_accepted_at
                          ? new Date(inv.ksef_accepted_at).toLocaleString('pl-PL', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {inv.ksef_number ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div>{seller.name}</div>
                        <div className="text-xs text-gray-500">NIP: {seller.nip}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {Number(inv.gross_total ?? 0).toFixed(2)} {cur}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    Brak faktur przychodzących — pojawią się tu po pobraniu z KSeF.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
