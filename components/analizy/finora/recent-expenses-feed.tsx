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
 * (strzałka w górę, zielony tekst o kontraście AA z Pulpitu). Kwota ujemna
 * (korekta in minus, §2.4 pkt 5) odwraca strzałkę i kolor wiersza i ma minus
 * typograficzny — korekta sprzedaży nie wygląda jak wpływ.
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
          items.map((item) => {
            const negative = item.amount < 0;
            // Wypływ albo korekta sprzedaży in minus — w dół; wpływ albo korekta zakupu in minus — w górę.
            const down = (direction === 'out') !== negative;
            const Arrow = down ? RiArrowDownLine : RiArrowUpLine;
            const tone = down ? 'text-destructive' : POSITIVE_TEXT_TONE;
            return (
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
                  <Arrow className={cn('size-4', tone)} aria-hidden />
                  <span className={cn('text-sm font-medium tabular-nums', tone)}>
                    {`${negative ? '\u2212' : ''}${formatPlMoney(Math.abs(item.amount))} zł`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default RecentExpensesFeed;
