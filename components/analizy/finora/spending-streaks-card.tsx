import type { ComponentType } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Port Finory `monthly-analytics/spending-streaks-card.tsx` (i identycznej
 * w budowie `income-expense-summary.tsx`): trzy wiersze `bg-muted p-3`
 * z ikoną, tytułem i wartością. „Spending Streaks” jako gra odpada (plan
 * §8 „Czego NIE robimy”) — komponent zostaje z inną treścią: „VAT
 * z wydatków” (P10), „Należności” (P11), „Przychody a koszty” (P10, P11).
 */

export interface SummaryRow {
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  title: string;
  value: string;
}

type SpendingStreaksCardProps = {
  title: string;
  description: string;
  rows: SummaryRow[];
  className?: string;
};

const SpendingStreaksCard = ({ title, description, rows, className }: SpendingStreaksCardProps) => {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.title} className="bg-muted flex items-center gap-3 p-3">
            <row.icon className={cn('size-6 shrink-0', row.iconClassName)} />
            <div className="min-w-0">
              <p className="text-sm font-medium">{row.title}</p>
              <p className="text-muted-foreground text-sm tabular-nums">{row.value}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default SpendingStreaksCard;
