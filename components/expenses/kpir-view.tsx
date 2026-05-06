'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
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
        <h1 className="font-display text-4xl font-semibold tracking-tighter-display">
          Książka Przychodów i Rozchodów
        </h1>
        <p className="mt-2 text-muted-foreground">
          Automatycznie generowana z faktur i wydatków
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="glass" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[160px] rounded-2xl border border-glass-border bg-glass-white px-4 py-2.5 text-center backdrop-blur-glass">
            <p className="font-display font-semibold">
              {monthLabel} {year}
            </p>
          </div>
          <Button variant="glass" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="glass-primary" size="lg" asChild>
          <Link href={exportHref}>
            <Download className="mr-2 h-4 w-4" />
            Eksport KPiR
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          label="Przychody"
          value={totalRevenue}
          className="border-green-500/20 bg-green-500/5"
        />
        <SummaryCard
          label="Wydatki"
          value={totalExpenses}
          className="border-red-500/20 bg-red-500/5"
        />
        <SummaryCard
          label={profit >= 0 ? 'Dochód' : 'Strata'}
          value={profit}
          className={
            profit >= 0
              ? 'border-blue-500/20 bg-blue-500/5'
              : 'border-orange-500/20 bg-orange-500/5'
          }
          highlight
        />
      </div>

      <section className="rounded-3xl border border-glass-border bg-glass-white p-7 shadow-glass backdrop-blur-glass">
        <h2 className="mb-4 font-display text-lg font-semibold tracking-tighter-text">
          Wydatki według kolumn KPiR
        </h2>
        <div className="space-y-2">
          <KpirRow
            label="Kol. 10 — Towary handlowe i materiały"
            sum={sums.col_10}
          />
          <KpirRow label="Kol. 11 — Koszty uboczne zakupu" sum={sums.col_11} />
          <KpirRow label="Kol. 12 — Wynagrodzenia" sum={sums.col_12} />
          <KpirRow label="Kol. 13 — Pozostałe wydatki" sum={sums.col_13} />
          <KpirRow label="Kol. 15 — Koszty B+R" sum={sums.col_15} />
          <div className="mt-3 flex items-center justify-between border-t-2 border-glass-border/80 pt-3">
            <span className="font-medium">Razem (kol. 14)</span>
            <span className="text-base font-bold tabular-nums">
              {totalExpenses.toFixed(2)} PLN
            </span>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-glass-border bg-glass-white shadow-glass backdrop-blur-glass">
        <div className="p-6 pb-3">
          <h2 className="font-display text-lg font-semibold tracking-tighter-text">
            Przychody (kol. 7–8) — {invoices.length} faktur
          </h2>
        </div>
        {invoices.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Brak przychodów w tym okresie
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-glass-border bg-foreground/3">
              <tr className="text-left">
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Data
                </th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Numer
                </th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Nabywca
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Netto
                </th>
                <th className="w-10 px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-glass-border/50 last:border-0 hover:bg-foreground/2"
                >
                  <td className="px-6 py-3">{inv.issue_date}</td>
                  <td className="px-6 py-3 font-mono text-xs">
                    {inv.internal_number ?? '—'}
                  </td>
                  <td className="px-6 py-3">{buyerName(inv.buyer_data)}</td>
                  <td className="px-6 py-3 text-right font-medium tabular-nums">
                    {Number(inv.net_total ?? 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-3">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="inline-flex text-muted-foreground hover:text-foreground"
                      aria-label="Szczegóły faktury"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-glass-border bg-glass-white shadow-glass backdrop-blur-glass">
        <div className="p-6 pb-3">
          <h2 className="font-display text-lg font-semibold tracking-tighter-text">
            Wydatki (kol. 10–15) — {expenses.length} pozycji
          </h2>
        </div>
        {expenses.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Brak wydatków w tym okresie
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-glass-border bg-foreground/3">
                <tr className="text-left">
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Data
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Sprzedawca
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Kategoria
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Kol.
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Netto
                  </th>
                  <th className="w-10 px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className="border-b border-glass-border/50 last:border-0 hover:bg-foreground/2"
                  >
                    <td className="px-6 py-3">{exp.issue_date}</td>
                    <td className="px-6 py-3">
                      <p className="max-w-[200px] truncate">{exp.seller_name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {exp.document_number ?? '—'}
                      </p>
                    </td>
                    <td className="px-6 py-3">
                      {exp.category_label ?? '—'}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs">
                      {exp.kpir_column?.replace('col_', '') ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-medium tabular-nums">
                      {Number(exp.net_amount ?? 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        href={`/expenses/${exp.id}`}
                        className="inline-flex text-muted-foreground hover:text-foreground"
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
    <div className={`rounded-3xl border p-5 backdrop-blur-glass ${className}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 tabular-nums ${
          highlight
            ? 'font-display text-3xl font-bold tracking-tighter-display'
            : 'text-2xl font-semibold'
        }`}
      >
        {value.toFixed(2)} PLN
      </p>
    </div>
  );
}

function KpirRow({ label, sum }: { label: string; sum: number }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <span className="font-medium tabular-nums">{sum.toFixed(2)} PLN</span>
    </div>
  );
}
