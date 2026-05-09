'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

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

/** Neon (wykres / wskaźniki) — zgodne z prośbą: zielony + czerwony. */
const NEON_GREEN = '#39ff9a';
const NEON_RED = '#ff3b5c';

function formatPlMoney(n: number): string {
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CashFlowDashboard({
  invoices,
  expenses,
  pendingReviewCount,
}: CashFlowDashboardProps) {
  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);

  const now = new Date();
  const monthsRange = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d
        .toLocaleDateString('pl-PL', { month: 'short' })
        .replace(/\./g, '')
        .trim(),
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

  const quickLinkClass =
    'group ff-glass-pane ff-glass-pane-hover flex flex-col rounded-[var(--ff-radius-lg)] p-6 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.01] hover:border-[color-mix(in_srgb,var(--ff-primary)_30%,transparent)] hover:shadow-[0_10px_28px_rgba(107,251,154,0.12)] active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ff-primary)_45%,transparent)]';

  return (
    <div className="pb-10 text-[var(--ff-on-surface)]">
      <div className="mb-10">
        <h1 className="mb-1 text-[40px] font-bold leading-[1.2] tracking-[-0.02em]">
          Przepływy pieniężne
        </h1>
        <p className="text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
          Przychód i koszty (netto) • ostatnie 6 miesięcy • faktury zaakceptowane w
          KSeF
        </p>
      </div>

      {pendingReviewCount > 0 ? (
        <Link
          href="/expenses?filter=unreviewed"
          className="group ff-glass-pane ff-glass-pane-hover mb-[var(--ff-gutter)] flex items-center gap-4 rounded-[var(--ff-radius-lg)] border border-[color-mix(in_srgb,var(--ff-secondary)_25%,transparent)] p-5 transition-all duration-200 hover:border-[color-mix(in_srgb,var(--ff-secondary)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--ff-secondary)_8%,transparent)]"
        >
          <span className="material-symbols-outlined shrink-0 text-[26px] text-[var(--ff-secondary)]">
            warning
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[var(--ff-on-surface)]">
              {pendingLabel}
            </p>
            <p className="mt-0.5 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
              Sprawdź dane rozpoznane automatycznie i zatwierdź
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)] transition-transform group-hover:translate-x-1" />
        </Link>
      ) : null}

      <div className="mb-[var(--ff-gutter)] grid grid-cols-2 gap-[var(--ff-gutter)] lg:grid-cols-4">
        <KpiCard
          label="Przychód miesiąca"
          value={current.revenue}
          change={revenueChange}
          showChange
          icon="trending_up"
          accent="primary"
        />
        <KpiCard
          label="Wydatki miesiąca"
          value={current.expense}
          icon="trending_down"
          accent="secondary"
        />
        <KpiCard
          label="Dochód miesiąca"
          value={current.profit}
          icon="account_balance_wallet"
          accent="tertiary"
          valueTone={current.profit >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="Szac. podatek YTD"
          value={estimatedTax}
          icon="receipt_long"
          accent="muted"
          subtitle="19% liniowy"
        />
      </div>

      <section className="ff-glass-pane mb-[var(--ff-gutter)] overflow-hidden rounded-[var(--ff-radius-lg)]">
        <div className="border-b border-white/10 px-6 py-5 sm:px-8">
          <h2 className="text-xl font-bold tracking-tight">Wykres 6 miesięcy</h2>
          <p className="mt-1 text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Słupki: przychód (zielony) vs wydatki (czerwony). Najedź na miesiąc —
            podświetlenie i podpowiedź z kwotami.
          </p>
        </div>
        <div className="px-4 pb-6 pt-2 sm:px-8">
          <div className="grid h-52 grid-cols-6 gap-2 sm:gap-3">
            {monthlyData.map((m) => {
              const revH = maxValue > 0 ? (m.revenue / maxValue) * 100 : 0;
              const expH = maxValue > 0 ? (m.expense / maxValue) * 100 : 0;
              const isHover = hoveredMonthKey === m.key;
              const noFlows = m.revenue <= 0 && m.expense <= 0;

              return (
                <div
                  key={m.key}
                  className="flex flex-col items-center gap-2"
                  onMouseEnter={() => setHoveredMonthKey(m.key)}
                  onMouseLeave={() => setHoveredMonthKey(null)}
                  onFocus={() => setHoveredMonthKey(m.key)}
                  onBlur={() => setHoveredMonthKey(null)}
                >
                  <button
                    type="button"
                    className={cn(
                      'flex h-44 w-full max-w-[72px] flex-col items-center justify-end gap-1 rounded-xl border border-transparent px-0.5 pb-1 pt-2 transition-all duration-200 sm:max-w-[88px]',
                      isHover &&
                        'border-white/15 bg-[color-mix(in_srgb,var(--ff-on-surface)_6%,transparent)] shadow-[0_8px_24px_rgba(0,0,0,0.25)]',
                    )}
                    aria-label={`${m.label}: przychód ${formatPlMoney(m.revenue)} PLN, wydatki ${formatPlMoney(m.expense)} PLN`}
                    title={`Przychód: ${formatPlMoney(m.revenue)} PLN\nWydatki: ${formatPlMoney(m.expense)} PLN\nDochód: ${formatPlMoney(m.profit)} PLN`}
                    onFocus={() => setHoveredMonthKey(m.key)}
                    onBlur={() => setHoveredMonthKey(null)}
                  >
                    {noFlows ? (
                      <div className="flex h-36 w-full flex-col items-center justify-end gap-3 pb-2">
                        <div className="flex items-end justify-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full transition-opacity duration-200"
                            style={{
                              backgroundColor: NEON_GREEN,
                              boxShadow: `0 0 14px 2px ${NEON_GREEN}`,
                              opacity: isHover ? 1 : 0.85,
                            }}
                            aria-hidden
                          />
                          <span
                            className="h-2.5 w-2.5 rounded-full transition-opacity duration-200"
                            style={{
                              backgroundColor: NEON_RED,
                              boxShadow: `0 0 14px 2px ${NEON_RED}`,
                              opacity: isHover ? 1 : 0.85,
                            }}
                            aria-hidden
                          />
                        </div>
                        <span className="text-[10px] font-medium text-[color-mix(in_srgb,var(--ff-on-surface-variant)_45%,transparent)]">
                          brak danych
                        </span>
                      </div>
                    ) : (
                      <div className="flex h-36 w-full items-end justify-center gap-1 sm:gap-1.5">
                        <div
                          className={cn(
                            'w-[28%] max-w-[18px] rounded-t-md transition-all duration-300 sm:max-w-[22px]',
                            isHover && 'scale-y-[1.02] origin-bottom',
                          )}
                          style={{
                            height: `${revH}%`,
                            minHeight: m.revenue > 0 ? 4 : 0,
                            backgroundColor: NEON_GREEN,
                            boxShadow: `0 0 ${isHover ? 16 : 10}px rgba(57, 255, 154, 0.45)`,
                          }}
                        />
                        <div
                          className={cn(
                            'w-[28%] max-w-[18px] rounded-t-md transition-all duration-300 sm:max-w-[22px]',
                            isHover && 'scale-y-[1.02] origin-bottom',
                          )}
                          style={{
                            height: `${expH}%`,
                            minHeight: m.expense > 0 ? 4 : 0,
                            backgroundColor: NEON_RED,
                            boxShadow: `0 0 ${isHover ? 16 : 10}px rgba(255, 59, 92, 0.45)`,
                          }}
                        />
                      </div>
                    )}
                  </button>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--ff-on-surface-variant)_70%,transparent)]">
                      {m.label}
                    </span>
                    <div
                      className="flex items-center gap-1.5"
                      aria-hidden
                      title="Wskaźniki kanału: zielony = przychód, czerwony = wydatek (jasniej gdy brak kwoty w miesiącu)"
                    >
                      <span
                        className="h-2 w-2 rounded-full transition-all duration-200"
                        style={{
                          backgroundColor: NEON_GREEN,
                          boxShadow: `0 0 8px ${NEON_GREEN}`,
                          opacity: m.revenue > 0 ? 0.35 : 1,
                          transform: isHover && m.revenue <= 0 ? 'scale(1.25)' : undefined,
                        }}
                      />
                      <span
                        className="h-2 w-2 rounded-full transition-all duration-200"
                        style={{
                          backgroundColor: NEON_RED,
                          boxShadow: `0 0 8px ${NEON_RED}`,
                          opacity: m.expense > 0 ? 0.35 : 1,
                          transform: isHover && m.expense <= 0 ? 'scale(1.25)' : undefined,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="ff-glass-pane mb-[var(--ff-gutter)] overflow-hidden rounded-[var(--ff-radius-lg)]">
        <div className="border-b border-white/10 px-6 py-5 sm:px-8">
          <h2 className="text-xl font-bold tracking-tight">Szczegóły miesięczne</h2>
          <p className="mt-1 text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Ta sama siatka co lista przeterminowanych — jeden styl kart i wierszy
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)]">
                <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                  Miesiąc
                </th>
                <th className="px-6 py-3.5 text-right text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                  Przychód (netto)
                </th>
                <th className="px-6 py-3.5 text-right text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                  Wydatki (netto)
                </th>
                <th className="px-6 py-3.5 text-right text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                  Dochód
                </th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m) => (
                <tr
                  key={m.key}
                  className="border-b border-white/6 transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)]"
                >
                  <td className="px-6 py-3.5 font-medium capitalize sm:px-8">
                    {m.label} {m.year}
                  </td>
                  <td className="px-6 py-3.5 text-right font-semibold tabular-nums text-[var(--ff-on-surface)] sm:px-8">
                    {formatPlMoney(m.revenue)}{' '}
                    <span className="text-[12px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
                      PLN
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right font-semibold tabular-nums text-[var(--ff-on-surface)] sm:px-8">
                    {formatPlMoney(m.expense)}{' '}
                    <span className="text-[12px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
                      PLN
                    </span>
                  </td>
                  <td
                    className={cn(
                      'px-6 py-3.5 text-right font-semibold tabular-nums sm:px-8',
                      m.profit >= 0
                        ? 'text-[var(--ff-primary)]'
                        : 'text-red-400',
                    )}
                  >
                    {formatPlMoney(m.profit)}{' '}
                    <span className="text-[12px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
                      PLN
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[var(--ff-gutter)] md:grid-cols-3">
        <Link href="/invoices/new" className={quickLinkClass}>
          <span className="material-symbols-outlined mb-3 text-[28px] text-[var(--ff-primary)]">
            add_circle
          </span>
          <p className="text-[16px] font-bold">Wystaw fakturę</p>
          <p className="mt-1 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Sprzedaż do KSeF
          </p>
          <span className="material-symbols-outlined mt-3 text-[20px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_45%,transparent)] transition-transform group-hover:translate-x-1">
            arrow_forward
          </span>
        </Link>
        <Link href="/expenses" className={quickLinkClass}>
          <span className="material-symbols-outlined mb-3 text-[28px] text-[var(--ff-secondary)]">
            receipt_long
          </span>
          <p className="text-[16px] font-bold">Dodaj wydatek</p>
          <p className="mt-1 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Paragon lub pliki
          </p>
          <span className="material-symbols-outlined mt-3 text-[20px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_45%,transparent)] transition-transform group-hover:translate-x-1">
            arrow_forward
          </span>
        </Link>
        <Link href="/reports/kpir" className={quickLinkClass}>
          <span className="material-symbols-outlined mb-3 text-[28px] text-[var(--ff-tertiary)]">
            menu_book
          </span>
          <p className="text-[16px] font-bold">Zobacz KPiR</p>
          <p className="mt-1 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Pełna księga
          </p>
          <span className="material-symbols-outlined mt-3 text-[20px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_45%,transparent)] transition-transform group-hover:translate-x-1">
            arrow_forward
          </span>
        </Link>
      </div>
    </div>
  );
}

type KpiCardProps = {
  label: string;
  value: number;
  change?: number;
  showChange?: boolean;
  icon: string;
  accent?: 'primary' | 'secondary' | 'tertiary' | 'muted';
  valueTone?: 'positive' | 'negative';
  subtitle?: string;
};

const accentIconClass: Record<
  NonNullable<KpiCardProps['accent']>,
  { wrap: string; icon: string }
> = {
  primary: {
    wrap: 'bg-[color-mix(in_srgb,var(--ff-primary)_20%,transparent)]',
    icon: 'text-[var(--ff-primary)]',
  },
  secondary: {
    wrap: 'bg-[color-mix(in_srgb,var(--ff-secondary)_20%,transparent)]',
    icon: 'text-[var(--ff-secondary)]',
  },
  tertiary: {
    wrap: 'bg-[color-mix(in_srgb,var(--ff-tertiary)_18%,transparent)]',
    icon: 'text-[var(--ff-tertiary)]',
  },
  muted: {
    wrap: 'bg-[color-mix(in_srgb,var(--ff-on-surface)_8%,transparent)]',
    icon: 'text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]',
  },
};

function KpiCard({
  label,
  value,
  change,
  showChange,
  icon,
  accent = 'primary',
  valueTone,
  subtitle,
}: KpiCardProps) {
  const a = accentIconClass[accent];
  return (
    <div className="ff-glass-pane ff-glass-pane-hover relative overflow-hidden rounded-[var(--ff-radius-lg)] p-6">
      <div className="mb-4 flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            a.wrap,
          )}
        >
          <span className={cn('material-symbols-outlined text-[22px]', a.icon)}>
            {icon}
          </span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_90%,transparent)]">
          {label}
        </span>
      </div>
      <p
        className={cn(
          'text-[28px] font-bold leading-none tabular-nums',
          valueTone === 'positive' && 'text-[var(--ff-primary)]',
          valueTone === 'negative' && 'text-red-400',
          !valueTone && 'text-[var(--ff-on-surface)]',
        )}
      >
        {formatPlMoney(value)}
      </p>
      <span className="mt-1 text-[12px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
        PLN
      </span>
      {showChange && change !== undefined && Math.abs(change) > 0.1 && !Number.isNaN(change) ? (
        <p
          className={cn(
            'mt-2 text-[12px] font-bold',
            change > 0 ? 'text-[var(--ff-primary)]' : 'text-red-400',
          )}
        >
          {change > 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% vs poprzedni miesiąc
        </p>
      ) : null}
      {subtitle ? (
        <p className="mt-2 text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_45%,transparent)]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
