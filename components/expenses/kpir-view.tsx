'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Database } from '@/types/database';

export type KpirExpenseRow = Database['public']['Tables']['expenses']['Row'];

export type KpirInvoiceRow = Pick<
  Database['public']['Tables']['invoices']['Row'],
  'id' | 'internal_number' | 'issue_date' | 'gross_total' | 'net_total' | 'buyer_data'
>;

const MONTHS = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

interface KpirViewProps {
  month: number;
  year: number;
  expenses: KpirExpenseRow[];
  invoices: KpirInvoiceRow[];
}

function buyerName(buyerData: KpirInvoiceRow['buyer_data']): string {
  if (!buyerData || typeof buyerData !== 'object' || Array.isArray(buyerData)) {
    return '—';
  }
  const name = (buyerData as Record<string, unknown>).name;
  return typeof name === 'string' && name.trim() ? name : '—';
}

function formatPlMoney(n: number): string {
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPlDate(iso: string): string {
  const day = iso.slice(0, 10);
  const [y, m, dd] = day.split('-').map(Number);
  if (!y || !m || !dd) return iso;
  return new Date(y, m - 1, dd).toLocaleDateString('pl-PL');
}

const navIconBtn =
  'ff-glass-pane ff-glass-pane-hover size-10 shrink-0 border-[color-mix(in_srgb,var(--ff-on-surface-variant)_18%,transparent)] text-[var(--ff-on-surface)] shadow-none hover:border-[color-mix(in_srgb,var(--ff-primary)_40%,transparent)] hover:text-[var(--ff-primary)]';

const exportBtnClass =
  'ff-glass-pane ff-glass-pane-hover border-[color-mix(in_srgb,var(--ff-on-surface-variant)_18%,transparent)] font-bold text-[var(--ff-on-surface)] shadow-none hover:border-[color-mix(in_srgb,var(--ff-primary)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--ff-primary)_8%,transparent)] hover:text-[var(--ff-primary)]';

const tableLinkClass =
  'inline-flex text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] transition-colors hover:text-[var(--ff-primary)]';

export function KpirView({ month, year, expenses, invoices }: KpirViewProps) {
  const router = useRouter();

  const navigate = (deltaMonths: number) => {
    const d = new Date(year, month - 1 + deltaMonths, 1);
    router.push(
      `/reports/kpir?month=${d.getMonth() + 1}&year=${d.getFullYear()}`,
    );
  };

  const sums = {
    col_7: invoices.reduce((s, i) => s + Number(i.net_total ?? 0), 0),
    col_8: 0,
    col_10: expenses
      .filter((e) => e.kpir_column === 'col_10')
      .reduce((s, e) => s + Number(e.net_amount ?? 0), 0),
    col_11: expenses
      .filter((e) => e.kpir_column === 'col_11')
      .reduce((s, e) => s + Number(e.net_amount ?? 0), 0),
    col_12: expenses
      .filter((e) => e.kpir_column === 'col_12')
      .reduce((s, e) => s + Number(e.net_amount ?? 0), 0),
    col_13: expenses
      .filter((e) => e.kpir_column === 'col_13')
      .reduce((s, e) => s + Number(e.net_amount ?? 0), 0),
    col_15: expenses
      .filter((e) => e.kpir_column === 'col_15')
      .reduce((s, e) => s + Number(e.net_amount ?? 0), 0),
  };

  const totalRevenue = sums.col_7 + sums.col_8;
  const totalExpenses =
    sums.col_10 + sums.col_11 + sums.col_12 + sums.col_13 + sums.col_15;
  const profit = totalRevenue - totalExpenses;

  const monthLabel = MONTHS[Math.min(12, Math.max(1, month)) - 1] ?? '';
  const exportHref = `/reports/exports?period=${year}-${String(month).padStart(2, '0')}&format=kpir_excel`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
          Książka Przychodów i Rozchodów
        </h1>
        <p className="text-sm text-[var(--ff-text-muted)]">
          Automatycznie generowana z faktur i wydatków
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className={navIconBtn}
            onClick={() => navigate(-1)}
            aria-label="Poprzedni miesiąc"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="ff-glass-pane min-w-[180px] rounded-[var(--ff-radius-lg)] px-5 py-3 text-center">
            <p className="text-[15px] font-bold text-[var(--ff-on-surface)]">
              {monthLabel} {year}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className={navIconBtn}
            onClick={() => navigate(1)}
            aria-label="Następny miesiąc"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="lg" asChild className={exportBtnClass}>
          <Link href={exportHref}>
            <Download className="mr-2 h-4 w-4" />
            Eksport KPiR
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-[var(--ff-gutter)] md:grid-cols-3">
        <SummaryCard
          label="Przychody"
          value={totalRevenue}
          className="border-emerald-400/20 bg-[color-mix(in_srgb,#34d399_10%,transparent)]"
        />
        <SummaryCard
          label="Wydatki"
          value={totalExpenses}
          className="border-red-400/20 bg-[color-mix(in_srgb,#f87171_10%,transparent)]"
        />
        <SummaryCard
          label={profit >= 0 ? 'Dochód' : 'Strata'}
          value={profit}
          className={
            profit >= 0
              ? 'border-[color-mix(in_srgb,var(--ff-primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--ff-primary)_10%,transparent)]'
              : 'border-orange-400/25 bg-[color-mix(in_srgb,#fb923c_12%,transparent)]'
          }
          highlight
        />
      </div>

      <section className="ff-glass-pane rounded-[var(--ff-radius-lg)] p-6 sm:p-8">
        <div className="mb-5 border-b border-white/10 pb-4">
          <h2 className="text-xl font-bold tracking-tight text-[var(--ff-on-surface)]">
            Wydatki według kolumn KPiR
          </h2>
        </div>
        <div className="space-y-1">
          <KpirRow
            label="Kol. 10 — Towary handlowe i materiały"
            sum={sums.col_10}
          />
          <KpirRow label="Kol. 11 — Koszty uboczne zakupu" sum={sums.col_11} />
          <KpirRow label="Kol. 12 — Wynagrodzenia" sum={sums.col_12} />
          <KpirRow label="Kol. 13 — Pozostałe wydatki" sum={sums.col_13} />
          <KpirRow label="Kol. 15 — Koszty B+R" sum={sums.col_15} />
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
            <span className="text-[14px] font-bold text-[var(--ff-on-surface)]">
              Razem (kol. 14)
            </span>
            <span className="text-right text-[16px] font-bold tabular-nums text-[var(--ff-on-surface)]">
              {formatPlMoney(totalExpenses)}{' '}
              <span className="text-[11px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
                PLN
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="ff-glass-pane overflow-hidden rounded-[var(--ff-radius-lg)]">
        <div className="border-b border-[var(--ff-border)] px-[22px] py-[18px]">
          <h2 className="text-xl font-bold tracking-tight text-[var(--ff-on-surface)]">
            Przychody (kol. 7–8) — {invoices.length} faktur
          </h2>
        </div>
        {invoices.length === 0 ? (
          <p className="px-6 py-10 pb-8 text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
            Brak przychodów w tym okresie
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-[var(--ff-border)]">
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Data
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Numer
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Nabywca
                  </th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Netto
                  </th>
                  <th className="w-12 px-6 py-3.5 sm:px-8" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-[var(--ff-row-divider)] transition-colors last:border-0 hover:bg-[var(--ff-row-hover)]"
                  >
                    <td className="px-6 py-3.5 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_70%,transparent)] sm:px-8">
                      {formatPlDate(inv.issue_date)}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[13px] sm:px-8">
                      {inv.internal_number ?? '—'}
                    </td>
                    <td className="px-6 py-3.5 font-medium text-[var(--ff-on-surface)] sm:px-8">
                      {buyerName(inv.buyer_data)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-semibold tabular-nums text-[var(--ff-on-surface)] sm:px-8">
                      {formatPlMoney(Number(inv.net_total ?? 0))}{' '}
                      <span className="text-[11px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
                        PLN
                      </span>
                    </td>
                    <td className="px-6 py-3.5 sm:px-8">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className={tableLinkClass}
                        aria-label="Szczegóły faktury"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ff-glass-pane overflow-hidden rounded-[var(--ff-radius-lg)]">
        <div className="border-b border-[var(--ff-border)] px-[22px] py-[18px]">
          <h2 className="text-xl font-bold tracking-tight text-[var(--ff-on-surface)]">
            Wydatki (kol. 10–15) — {expenses.length} pozycji
          </h2>
        </div>
        {expenses.length === 0 ? (
          <p className="px-6 py-10 pb-8 text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
            Brak wydatków w tym okresie
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-[var(--ff-border)]">
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Data
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Sprzedawca
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Kategoria
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Kol.
                  </th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Netto
                  </th>
                  <th className="w-12 px-6 py-3.5 sm:px-8" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className="border-b border-[var(--ff-row-divider)] transition-colors last:border-0 hover:bg-[var(--ff-row-hover)]"
                  >
                    <td className="px-6 py-3.5 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_70%,transparent)] sm:px-8">
                      {formatPlDate(exp.issue_date)}
                    </td>
                    <td className="px-6 py-3.5 sm:px-8">
                      <p className="max-w-[220px] truncate font-medium text-[var(--ff-on-surface)]">
                        {exp.seller_name}
                      </p>
                      <p className="font-mono text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
                        {exp.document_number ?? '—'}
                      </p>
                    </td>
                    <td className="px-6 py-3.5 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_75%,transparent)] sm:px-8">
                      {exp.category_label ?? '—'}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_70%,transparent)] sm:px-8">
                      {exp.kpir_column?.replace('col_', '') ?? '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right font-semibold tabular-nums text-[var(--ff-on-surface)] sm:px-8">
                      {formatPlMoney(Number(exp.net_amount ?? 0))}{' '}
                      <span className="text-[11px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
                        PLN
                      </span>
                    </td>
                    <td className="px-6 py-3.5 sm:px-8">
                      <Link
                        href={`/expenses/${exp.id}`}
                        className={tableLinkClass}
                        aria-label="Szczegóły wydatku"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  className,
  highlight,
}: {
  label: string;
  value: number;
  className: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'ff-glass-pane ff-glass-pane-hover rounded-[var(--ff-radius-lg)] border p-6',
        className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
        {label}
      </p>
      <p
        className={cn(
          'mt-3 tabular-nums text-[var(--ff-on-surface)]',
          highlight
            ? 'text-[40px] font-bold leading-none tracking-[-0.02em]'
            : 'text-[28px] font-bold leading-none',
        )}
      >
        {formatPlMoney(value)}{' '}
        <span className="text-[12px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
          PLN
        </span>
      </p>
    </div>
  );
}

function KpirRow({ label, sum }: { label: string; sum: number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg py-2.5 pl-1 pr-1 transition-colors hover:bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)]">
      <span className="text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]">
        {label}
      </span>
      <span className="shrink-0 text-right text-[14px] font-semibold tabular-nums text-[var(--ff-on-surface)]">
        {formatPlMoney(sum)}{' '}
        <span className="text-[11px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
          PLN
        </span>
      </span>
    </div>
  );
}
