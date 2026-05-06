'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Edit3,
  Inbox,
  Upload,
} from 'lucide-react';

import type { Database } from '@/types/database';

export type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
type ExpenseSource = Database['public']['Enums']['expense_source'];

interface SourceBadgeConfig {
  label: string;
  icon: LucideIcon;
  className: string;
}

const SOURCE_LABELS: Record<ExpenseSource, SourceBadgeConfig> = {
  ocr_photo: {
    label: 'Zdjęcie',
    icon: Camera,
    className:
      'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  },
  ksef_inbox: {
    label: 'KSeF',
    icon: Inbox,
    className:
      'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
  },
  manual: {
    label: 'Ręczne',
    icon: Edit3,
    className: 'bg-foreground/5 text-muted-foreground border-glass-border',
  },
  import: {
    label: 'Import',
    icon: Upload,
    className: 'bg-foreground/5 text-muted-foreground border-glass-border',
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
      <div className="rounded-3xl border border-glass-border bg-glass-white py-16 text-center shadow-glass backdrop-blur-glass">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/5">
          <Camera className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-1 font-display text-lg font-semibold tracking-tighter-text">
          {unreviewedEmpty
            ? 'Brak wydatków do akceptacji'
            : 'Brak wydatków w tym miesiącu'}
        </h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
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
              <h2 className="text-sm font-medium text-muted-foreground">
                {new Date(`${date}T12:00:00`).toLocaleDateString('pl-PL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {dailyTotal.toFixed(2)} PLN
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
  const SourceIcon = cfg.icon;
  const kpirLabel = kpirShortLabel(expense.kpir_column);
  const needsReview = !expense.is_reviewed;
  const categoryPart = expense.category_label?.trim() || '—';

  return (
    <Link
      href={`/expenses/${expense.id}`}
      className="block rounded-2xl border border-glass-border bg-glass-white p-4 shadow-glass-sm backdrop-blur-glass transition-all duration-200 ease-apple hover:bg-glass-white-strong"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            needsReview ? 'bg-orange-500/10' : 'bg-foreground/5'
          }`}
        >
          {needsReview ? (
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-3">
            <p className="truncate text-sm font-medium">{expense.seller_name}</p>
            <p className="shrink-0 text-sm font-medium tabular-nums">
              {Number(expense.gross_amount).toFixed(2)} PLN
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}
              >
                <SourceIcon className="h-3 w-3" />
                {cfg.label}
              </span>
              <span className="inline-flex items-center rounded-full border border-glass-border bg-foreground/5 px-2 py-0.5 text-xs font-medium">
                {categoryPart} · {kpirLabel}
              </span>
              {needsReview ? (
                <span className="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                  Do akceptacji
                </span>
              ) : null}
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {expense.document_number ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
