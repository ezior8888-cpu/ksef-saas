import { RiBox3Line, RiMoreLine, RiPriceTag3Line } from '@remixicon/react';

import { PulpitEmptyState } from '@/components/dashboard/pulpit/card-states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { BreakdownSlice } from '@/lib/analytics-finance/breakdown';
import { formatPlMoney } from '@/lib/format/pl';

import type { EmptyStateProps } from './empty';

/**
 * Port Finory `monthly-analytics/category-ranked-list.tsx` („Top
 * Categories”): ikona w kółku, nazwa, kwota, pasek udziału (`ui/progress`).
 * Finora ma ikonę na każdą ze stałych kategorii; u nas kategorie i produkty
 * przychodzą z danych, więc jedna ikona rodzaju (kategoria / produkt)
 * i `RiMoreLine` dla „Pozostałe”. Server Component — bez stanu.
 */
type CategoryRankedListProps = {
  title: string;
  description: string;
  data: BreakdownSlice[];
  kind: 'category' | 'product';
  empty: EmptyStateProps;
  className?: string;
};

const CategoryRankedList = ({ title, description, data, kind, empty, className }: CategoryRankedListProps) => {
  const ItemIcon = kind === 'product' ? RiBox3Line : RiPriceTag3Line;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.length === 0 ? (
          <PulpitEmptyState {...empty} />
        ) : (
          data.map((item) => {
            const Icon = item.other ? RiMoreLine : ItemIcon;

            return (
              <div key={item.key} className="flex items-center gap-4">
                <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full">
                  <Icon className="text-foreground size-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium" title={item.label}>
                      {item.label}
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">{`${formatPlMoney(item.amount)} zł`}</span>
                  </div>
                  <Progress
                    value={item.percentage}
                    aria-label={`${item.label}: ${Math.round(item.percentage)}%`}
                    className="*:data-[slot=progress-track]:h-1.5"
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default CategoryRankedList;
