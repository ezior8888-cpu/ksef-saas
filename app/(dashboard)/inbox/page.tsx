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
  const nip =
    sd?.nip?.trim() || fa3?.seller?.nip?.trim() || row.seller_nip?.trim() || '—';
  return { name, nip };
}

function formatMoney(value: string | number | null, currency: string): string {
  const n = Number(value ?? 0);
  return `${new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)} ${currency}`;
}

export default async function InboxPage() {
  const supabase = await createClient();

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(
      'id, ksef_number, issue_date, seller_nip, seller_data, fa3_data, gross_total, currency, ksef_accepted_at',
    )
    .eq('direction', 'incoming')
    .order('ksef_accepted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (invoices ?? []) as InboxRow[];
  const hasRows = rows.length > 0;

  return (
    <div className="space-y-8 pb-10 text-[var(--ff-on-surface)]">
      <div>
        <h1 className="mb-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
          Skrzynka odbiorcza
        </h1>
        <p className="text-sm text-[var(--ff-text-muted)]">
          Faktury zakupowe pobrane z KSeF (aktualizowane co 15 minut)
        </p>
      </div>

      {error ? (
        <div className="rounded-[var(--ff-radius-lg)] border border-[var(--ff-danger)]/25 bg-[var(--ff-danger-tint)] px-5 py-4 text-sm text-[var(--ff-danger)]">
          Nie udało się pobrać faktur: {error.message}
        </div>
      ) : !hasRows ? (
        <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] px-8 py-16 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-primary)_18%,transparent)]">
            <span className="material-symbols-outlined text-[32px] text-[var(--ff-primary)]">
              inbox
            </span>
          </div>
          <h3 className="mb-2 text-xl font-bold tracking-tight">Brak faktur przychodzących</h3>
          <p className="mx-auto max-w-md text-sm text-[var(--ff-text-muted)]">
            Otrzymane faktury pojawią się tutaj automatycznie po synchronizacji z KSeF
          </p>
        </div>
      ) : (
        <div className="ff-glass-pane overflow-hidden rounded-[var(--ff-radius-lg)]">
          <div className="border-b border-[var(--ff-border)] px-[22px] py-[18px]">
            <h2 className="text-[15px] font-semibold text-[var(--ff-text-strong)]">Lista faktur przychodzących</h2>
            <p className="mt-1 text-[13px] text-[var(--ff-text-muted)]">
              {rows.length} pozycji (max. 200) • sortowanie wg daty przyjęcia w KSeF
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-[var(--ff-border)]">
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Data otrzymania
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Numer KSeF
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Sprzedawca
                  </th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Kwota brutto
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const seller = sellerDisplay(inv);
                  const cur = inv.currency?.trim() || 'PLN';
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-[var(--ff-row-divider)] transition-colors last:border-0 hover:bg-[var(--ff-row-hover)]"
                    >
                      <td className="px-6 py-4 font-mono text-[13px] text-[var(--ff-text-muted)]">
                        {inv.ksef_accepted_at
                          ? new Date(inv.ksef_accepted_at).toLocaleString('pl-PL', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </td>
                      <td className="px-6 py-4 font-mono text-[13px] text-[var(--ff-text-soft)]">
                        {inv.ksef_number ?? '—'}
                      </td>
                      <td className="px-6 py-4 sm:px-8">
                        <div className="font-semibold text-[var(--ff-on-surface)]">{seller.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-[var(--ff-text-dim)]">
                          {seller.nip}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-[13px] font-semibold tabular-nums text-[var(--ff-on-surface)] sm:px-8">
                        {formatMoney(inv.gross_total, cur)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
