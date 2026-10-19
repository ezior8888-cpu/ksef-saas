'use client';

import { Line, LineChart } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { formatPlCompactMoney, formatPlMoney } from '@/lib/format/pl';
import { cn } from '@/lib/utils';

import { PULPIT_EMPTY, PulpitEmptyState } from './card-states';

/**
 * Firma zwolniona podmiotowo z VAT (art. 113) nie ma „VAT należnego” ani
 * terminu JPK — w miejscu tej karty widzi sprzedaż netto narastająco od
 * 1 stycznia (Finora: `statistics-impression-card.tsx`).
 *
 * Limitu zwolnienia (240 000 zł, proporcja dla firmy założonej w trakcie
 * roku, prognoza) karta jeszcze NIE liczy: funkcje limitu leżą w
 * `lib/flo/functions/vat-limit.ts` za znacznikiem NIEAKTYWNE (AUD-115),
 * a data rozpoczęcia działalności jest tylko w profilu FLO. Decyzja
 * Bartosza w dzienniku planu Finora (E4). Do tego czasu karta nie pokazuje
 * procentu limitu, bo bez proporcji zaniżyłaby go firmie z tego roku.
 */

const config = {
  sales: { label: 'Sprzedaż narastająco', color: 'var(--chart-5)' },
} satisfies ChartConfig;

export interface SalesYtdCardProps {
  months: { key: string; label: string }[];
  /** Sprzedaż netto narastająco po każdym miesiącu od stycznia. */
  cumulative: number[];
  className?: string;
}

export function SalesYtdCard({ months, cumulative, className }: SalesYtdCardProps) {
  const total = cumulative.at(-1) ?? 0;
  const data = months.map((m, i) => ({ month: m.label, sales: cumulative[i] ?? 0 }));
  const withSales = cumulative.filter((v) => v !== 0).length;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Sprzedaż od 1 stycznia</CardTitle>
        <CardDescription className="text-muted-foreground text-base">Netto, narastająco</CardDescription>
      </CardHeader>
      {total === 0 && withSales === 0 ? (
        <CardContent className="flex flex-1">
          <PulpitEmptyState message={PULPIT_EMPTY.noInvoices} action={PULPIT_EMPTY.issueInvoice} />
        </CardContent>
      ) : (
        <>
          <CardContent>
            {months.length >= 2 ? (
              <ChartContainer config={config} className="h-21 w-full">
                <LineChart accessibilityLayer data={data} margin={{ left: 4, right: 4 }}>
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value) => `${formatPlMoney(Number(value))} zł`}
                      />
                    }
                  />
                  <Line dataKey="sales" type="linear" dot={false} stroke="var(--color-sales)" strokeWidth={3} />
                </LineChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm">{PULPIT_EMPTY.trendAfterSecondMonth}</p>
            )}
          </CardContent>
          <CardContent className={cn('flex items-center justify-between gap-2')}>
            <span className="text-xl font-semibold" title={`${formatPlMoney(total)} zł`}>
              {formatPlCompactMoney(total)}
            </span>
            <span className="text-muted-foreground text-sm">zwolnienie z VAT</span>
          </CardContent>
        </>
      )}
    </Card>
  );
}
