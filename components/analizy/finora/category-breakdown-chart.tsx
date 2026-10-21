'use client';

import { Cell, Pie, PieChart } from 'recharts';

import { PulpitEmptyState } from '@/components/dashboard/pulpit/card-states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { BreakdownSlice } from '@/lib/analytics-finance/breakdown';
import { formatPlMoney } from '@/lib/format/pl';

import type { EmptyStateProps } from './empty';
import { sliceChartConfig, sliceSlot } from './slices';

/**
 * Port Finory `monthly-analytics/category-breakdown-chart.tsx` („Spend by
 * Category”): `PieChart`, `innerRadius={60}`, legenda pod wykresem. Finora
 * ma stałe kategorie z kolorami `chart-1…5` i „Miscellaneous” w
 * `muted-foreground`; u nas pozycje przychodzą z danych (top 5 + „Pozostałe”),
 * więc kolor idzie po miejscu w rankingu, a „Pozostałe” zostaje szare.
 */

type CategoryBreakdownChartProps = {
  title: string;
  description: string;
  data: BreakdownSlice[];
  empty: EmptyStateProps;
  className?: string;
};

const CategoryBreakdownChart = ({ title, description, data, empty, className }: CategoryBreakdownChartProps) => {
  const chartConfig = sliceChartConfig(data);
  const chartData = data.map((slice, index) => ({ ...slice, slot: sliceSlot(slice, index) }));

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <PulpitEmptyState {...empty} />
        ) : (
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-70">
            <PieChart>
              <ChartTooltip
                content={<ChartTooltipContent hideLabel nameKey="slot" formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">{chartConfig[String(name)]?.label ?? ''}</span>
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {`${formatPlMoney(Number(value))} zł`}
                    </span>
                  </div>
                )} />}
              />
              <Pie data={chartData} dataKey="amount" nameKey="slot" innerRadius={60} strokeWidth={2}>
                {chartData.map((entry) => (
                  <Cell key={entry.slot} fill={`var(--color-${entry.slot})`} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="slot" className="flex-wrap gap-x-4 gap-y-1" />} />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default CategoryBreakdownChart;
