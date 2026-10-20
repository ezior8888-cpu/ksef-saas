import { RiArrowDownLine, RiArrowUpLine, RiFileList3Line, RiReceiptLine } from '@remixicon/react';

import { PulpitEmptyState } from '@/components/dashboard/pulpit/card-states';
import { POSITIVE_TEXT_TONE } from '@/components/dashboard/pulpit/stat-tile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPlMoney } from '@/lib/format/pl';
import { cn } from '@/lib/utils';

import type { EmptyStateProps } from './empty';

/**
 * Port Finory `monthly-analytics/recent-expenses-feed.tsx` („Recent
 * Expenses”): ikona, nazwa, data, kwota ze strzałką. Dwa kierunki: wydatki
 * (strzałka w dół, `destructive`, jak w Finorze) i faktury sprzedaży
 * (strzałka w górę, zielony tekst o kontraście AA z Pulpitu).
 */

export interface FeedItem {
  id: string;
  name: string;
  /** Druga linia: data (DD.MM.RRRR), przy fakturze też numer. */
  subtitle: string;
  amount: number;
}

type RecentExpensesFeedProps = {
  title: string;
  description: string;
  items: FeedItem[];
  direction: 'out' | 'in';
  empty: EmptyStateProps;
  className?: string;
};

const RecentExpensesFeed = ({ title, description, items, direction, empty, className }: RecentExpensesFeedProps) => {
  const Icon = direction === 'out' ? RiReceiptLine : RiFileList3Line;
  const Arrow = direction === 'out' ? RiArrowDownLine : RiArrowUpLine;
  const tone = direction === 'out' ? 'text-destructive' : POSITIVE_TEXT_TONE;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <PulpitEmptyState {...empty} />
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-4">
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full">
                <Icon className="text-foreground size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={item.name}>
                  {item.name}
                </p>
                <p className="text-muted-foreground truncate text-xs">{item.subtitle}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Arrow className={cn('size-4', tone)} />
                <span className={cn('text-sm font-medium tabular-nums', tone)}>{`${formatPlMoney(item.amount)} zł`}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default RecentExpensesFeed;
