'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { PulpitEmptyState } from '@/components/dashboard/pulpit/card-states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { TrendPoint } from '@/lib/analytics-finance/costs';
import { formatPlCompactMoney, formatPlMoney } from '@/lib/format/pl';

import { ANALIZY_EMPTY, type EmptyStateProps } from './empty';

/**
 * Port Finory `monthly-analytics/spend-trend-chart.tsx` („Spend Trend”):
 * jedna seria słupków, 6 miesięcy. Oś i podpowiedź w złotych (§7.1).
 * Puste stany z §7.3: bez danych — komunikat karty; jeden miesiąc z danymi —
 * kwota bez wykresu i „Wykres pojawi się po drugim miesiącu”.
 */
type SpendTrendChartProps = {
  title: string;
  description: string;
  seriesLabel: string;
  data: TrendPoint[];
  empty: EmptyStateProps;
  className?: string;
};

const SpendTrendChart = ({ title, description, seriesLabel, data, empty, className }: SpendTrendChartProps) => {
  const chartConfig = { amount: { label: seriesLabel, color: 'var(--chart-1)' } } satisfies ChartConfig;
  const withData = data.filter((point) => point.amount !== 0);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {withData.length === 0 ? (
          <PulpitEmptyState {...empty} />
        ) : withData.length < 2 ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center">
            <p className="text-2xl font-medium tabular-nums">{`${formatPlMoney(withData[0]!.amount)} zł`}</p>
            <p className="text-muted-foreground text-sm">{withData[0]!.label}</p>
            <PulpitEmptyState message={ANALIZY_EMPTY.trendAfterSecondMonth} className="py-2" />
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="max-h-70 w-full">
            <BarChart accessibilityLayer data={data}>
              <CartesianGrid vertical={false} strokeDasharray="5" stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} tickMargin={10} axisLine={false} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                width={64}
                tickFormatter={(value) => formatPlCompactMoney(Number(value))}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    className="w-40"
                    formatter={(value, _name, item) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {String((item.payload as { label?: string } | undefined)?.label ?? '')}
                        </span>
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          {`${formatPlMoney(Number(value))} zł`}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="amount" fill="var(--color-amount)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default SpendTrendChart;
