'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowRight,
  Receipt,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Database } from '@/types/database';

export type CashFlowInvoiceRow = Pick<
  Database['public']['Tables']['invoices']['Row'],
  'issue_date' | 'net_total' | 'gross_total'
>;

export type CashFlowExpenseRow = Pick<
  Database['public']['Tables']['expenses']['Row'],
  'issue_date' | 'net_amount' | 'gross_amount' | 'kpir_column'
>;

interface CashFlowDashboardProps {
  invoices: CashFlowInvoiceRow[];
  expenses: CashFlowExpenseRow[];
  pendingReviewCount: number;
}

export function CashFlowDashboard({
  invoices,
  expenses,
  pendingReviewCount,
}: CashFlowDashboardProps) {
  const now = new Date();
  const monthsRange = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('pl-PL', { month: 'short' }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    };
  });

  const monthlyData = monthsRange.map((m) => {
    const monthInvoices = invoices.filter((i) => i.issue_date.startsWith(m.key));
    const monthExpenses = expenses.filter((e) => e.issue_date.startsWith(m.key));
    const revenue = monthInvoices.reduce(
      (s, i) => s + Number(i.net_total ?? 0),
      0,
    );
    const expense = monthExpenses.reduce(
      (s, e) => s + Number(e.net_amount ?? 0),
      0,
    );
    return {
      ...m,
      revenue,
      expense,
      profit: revenue - expense,
    };
  });

  const maxValue = Math.max(
    1,
    ...monthlyData.map((m) => Math.max(m.revenue, m.expense)),
  );

  const current = monthlyData[monthlyData.length - 1];
  const previous = monthlyData[monthlyData.length - 2];
  const revenueChange = previous?.revenue
    ? ((current.revenue - previous.revenue) / previous.revenue) * 100
    : 0;

  const cumulativeProfit = monthlyData.reduce((s, m) => s + m.profit, 0);
  const estimatedTax = Math.max(0, cumulativeProfit * 0.19);

  const pendingLabel =
    pendingReviewCount === 1
      ? '1 wydatek czeka na akceptację'
      : `${pendingReviewCount} wydatków czeka na akceptację`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tighter-display">
          Witaj z powrotem
        </h1>
        <p className="mt-2 text-muted-foreground">
          Twój cash flow w pigułce — ostatnie 6 miesięcy
        </p>
      </div>

      {pendingReviewCount > 0 ? (
        <Link
          href="/expenses?filter=unreviewed"
          className="block rounded-3xl border border-orange-500/20 bg-orange-500/5 p-5 shadow-glass backdrop-blur-glass transition-colors hover:bg-orange-500/10"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-orange-600 dark:text-orange-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{pendingLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sprawdź dane rozpoznane automatycznie i zatwierdź
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Przychód miesiąca"
          value={current.revenue}
          change={revenueChange}
          icon={TrendingUp}
        />
        <KpiCard
          label="Wydatki miesiąca"
          value={current.expense}
          icon={TrendingDown}
          neutral
        />
        <KpiCard
          label="Dochód miesiąca"
          value={current.profit}
          highlight={current.profit >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="Szac. podatek YTD"
          value={estimatedTax}
          icon={Receipt}
          neutral
          subtitle="19% liniowy"
        />
      </div>

      <section className="rounded-3xl border border-glass-border bg-glass-white p-7 shadow-glass backdrop-blur-glass">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tighter-text">
          Przepływy 6 miesięcy
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Zielony = przychód, czerwony = wydatki (netto)
        </p>

        <div className="grid h-48 grid-cols-6 items-end gap-3">
          {monthlyData.map((m) => (
            <div key={m.key} className="flex flex-col items-center gap-2">
              <div className="flex h-40 w-full items-end justify-center gap-1">
                <div
                  className="w-3 rounded-t-md bg-green-500/60 transition-all duration-500 ease-apple dark:bg-green-500/40 lg:w-5"
                  style={{
                    height: maxValue > 0 ? `${(m.revenue / maxValue) * 100}%` : '0%',
                    minHeight: m.revenue > 0 ? 2 : 0,
                  }}
                  title={`Przychód: ${m.revenue.toFixed(2)} PLN`}
                />
                <div
                  className="w-3 rounded-t-md bg-red-500/60 transition-all duration-500 ease-apple dark:bg-red-500/40 lg:w-5"
                  style={{
                    height: maxValue > 0 ? `${(m.expense / maxValue) * 100}%` : '0%',
                    minHeight: m.expense > 0 ? 2 : 0,
                  }}
                  title={`Wydatki: ${m.expense.toFixed(2)} PLN`}
                />
              </div>
              <span className="text-xs text-muted-foreground">{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <QuickLink
          href="/invoices/new"
          label="Wystaw fakturę"
          desc="Sprzedaż do KSeF"
        />
        <QuickLink
          href="/expenses"
          label="Dodaj wydatek"
          desc="Zdjęcie paragonu lub pliki"
        />
        <QuickLink
          href="/reports/kpir"
          label="Zobacz KPiR"
          desc="Pełna księga"
        />
      </div>
    </div>
  );
}

type KpiCardProps = {
  label: string;
  value: number;
  change?: number;
  icon?: LucideIcon;
  highlight?: 'positive' | 'negative';
  neutral?: boolean;
  subtitle?: string;
};

function KpiCard({
  label,
  value,
  change,
  icon: Icon,
  highlight,
  neutral,
  subtitle,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass',
        highlight === 'positive' && 'border-green-500/20 bg-green-500/5',
        highlight === 'negative' && 'border-red-500/20 bg-red-500/5',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
      </div>
      <p className="font-display text-2xl font-semibold tabular-nums tracking-tighter-display">
        {value.toFixed(2)}
        <span className="ml-1 text-base font-normal text-muted-foreground">
          PLN
        </span>
      </p>
      {change !== undefined &&
      Math.abs(change) > 0.1 &&
      !neutral &&
      !Number.isNaN(change) ? (
        <p
          className={cn(
            'mt-1 text-xs',
            change > 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400',
          )}
        >
          {change > 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% vs miesiąc temu
        </p>
      ) : null}
      {subtitle ? (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

function QuickLink({
  href,
  label,
  desc,
}: {
  href: string;
  label: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-3xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass transition-all duration-200 ease-apple hover:bg-glass-white-strong active:scale-[0.98]"
    >
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      <ArrowRight className="mt-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
