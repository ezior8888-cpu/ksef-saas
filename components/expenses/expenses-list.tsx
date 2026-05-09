'use client';

import Link from 'next/link';

import type { Database } from '@/types/database';
import { cn } from '@/lib/utils';

export type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
type ExpenseSource = Database['public']['Enums']['expense_source'];

interface SourceBadgeConfig {
  label: string;
  symbol: string;
  className: string;
}

const SOURCE_LABELS: Record<ExpenseSource, SourceBadgeConfig> = {
  ocr_photo: {
    label: 'Zdjęcie',
    symbol: 'photo_camera',
    className:
      'border-blue-400/25 bg-[color-mix(in_srgb,#60a5fa_14%,transparent)] text-blue-200',
  },
  ksef_inbox: {
    label: 'KSeF',
    symbol: 'inbox',
    className:
      'border-purple-400/25 bg-[color-mix(in_srgb,#a78bfa_14%,transparent)] text-purple-200',
  },
  manual: {
    label: 'Ręczne',
    symbol: 'edit',
    className:
      'border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_6%,transparent)] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_80%,transparent)]',
  },
  import: {
    label: 'Import',
    symbol: 'upload',
    className:
      'border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_6%,transparent)] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_80%,transparent)]',
  },
};

const KPIR_LABELS: Record<string, string> = {
  col_7: 'Kol. 7',
  col_8: 'Kol. 8',
  col_10: 'Towary',
  col_11: 'Koszty uboczne',
  col_12: 'Wynagrodzenia',
  col_13: 'Pozostałe',
  col_15: 'B+R',
  col_16: 'Kol. 16',
};

function sourceConfig(source: ExpenseRow['source']): SourceBadgeConfig {
  return SOURCE_LABELS[source] ?? SOURCE_LABELS.manual;
}

function kpirShortLabel(col: ExpenseRow['kpir_column']): string {
  if (!col) return '—';
  return KPIR_LABELS[col] ?? col;
}

function formatPlMoney(n: number): string {
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ExpensesList({
  initialExpenses,
  listVariant = 'month',
}: {
  initialExpenses: ExpenseRow[];
  listVariant?: 'month' | 'unreviewed';
}) {
  if (initialExpenses.length === 0) {
    const unreviewedEmpty = listVariant === 'unreviewed';
    return (
      <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] px-8 py-16 text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-primary)_18%,transparent)]">
          <span className="material-symbols-outlined text-[32px] text-[var(--ff-primary)]">
            {unreviewedEmpty ? 'task_alt' : 'receipt_long'}
          </span>
        </div>
        <h3 className="mb-2 text-xl font-bold tracking-tight">
          {unreviewedEmpty
            ? 'Brak wydatków do akceptacji'
            : 'Brak wydatków w tym miesiącu'}
        </h3>
        <p className="mx-auto max-w-md text-[15px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
          {unreviewedEmpty
            ? 'Wszystkie wydatki są już sprawdzone — świetna robota.'
            : 'Zrób zdjęcie paragonu lub poczekaj aż KSeF dostarczy faktury zakupowe'}
        </p>
      </div>
    );
  }

  const groups = initialExpenses.reduce<Record<string, ExpenseRow[]>>(
    (acc, exp) => {
      const date = exp.issue_date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(exp);
      return acc;
    },
    {},
  );

  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {sortedDates.map((date) => {
        const expenses = groups[date] ?? [];
        const dailyTotal = expenses.reduce(
          (sum, e) => sum + Number(e.gross_amount),
          0,
        );
        return (
          <div key={date}>
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
                {new Date(`${date}T12:00:00`).toLocaleDateString('pl-PL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </h2>
              <span className="tabular-nums text-[13px] font-semibold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_70%,transparent)]">
                {formatPlMoney(dailyTotal)}{' '}
                <span className="text-[11px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
                  PLN
                </span>
              </span>
            </div>
            <div className="space-y-2">
              {expenses.map((exp) => (
                <ExpenseRow key={exp.id} expense={exp} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExpenseRow({ expense }: { expense: ExpenseRow }) {
  const cfg = sourceConfig(expense.source);
  const kpirLabel = kpirShortLabel(expense.kpir_column);
  const needsReview = !expense.is_reviewed;
  const categoryPart = expense.category_label?.trim() || '—';

  return (
    <Link
      href={`/expenses/${expense.id}`}
      className={cn(
        'ff-glass-pane ff-glass-pane-hover block rounded-[var(--ff-radius-lg)] p-4 transition-transform duration-200 ease-out hover:scale-[1.005]',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
            needsReview
              ? 'border-orange-400/25 bg-[color-mix(in_srgb,#fb923c_14%,transparent)]'
              : 'border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_6%,transparent)]',
          )}
        >
          {needsReview ? (
            <span className="material-symbols-outlined text-[22px] text-orange-200">
              pending_actions
            </span>
          ) : (
            <span className="material-symbols-outlined text-[22px] text-emerald-300">
              check_circle
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-3">
            <p className="truncate text-[14px] font-semibold text-[var(--ff-on-surface)]">
              {expense.seller_name}
            </p>
            <p className="shrink-0 tabular-nums text-[14px] font-bold text-[var(--ff-on-surface)]">
              {formatPlMoney(Number(expense.gross_amount))}{' '}
              <span className="text-[11px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
                PLN
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold',
                  cfg.className,
                )}
              >
                <span className="material-symbols-outlined text-[14px] leading-none">
                  {cfg.symbol}
                </span>
                {cfg.label}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_5%,transparent)] px-2 py-0.5 text-[11px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]">
                {categoryPart} · {kpirLabel}
              </span>
              {needsReview ? (
                <span className="inline-flex items-center rounded-full border border-orange-400/25 bg-[color-mix(in_srgb,#fb923c_12%,transparent)] px-2 py-0.5 text-[11px] font-bold text-orange-100">
                  Do akceptacji
                </span>
              ) : null}
            </div>
            <span className="font-mono text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
              {expense.document_number ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
