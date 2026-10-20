import type { MonthOption } from '@/lib/analytics-finance/months';

import MonthSelector from './finora/month-selector';

/**
 * Nagłówek strony analiz — 1:1 z Finory `monthly-analytics/index.tsx`:
 * tytuł i podpis po lewej, wybór miesiąca po prawej (na telefonie pod
 * spodem, przy prawej krawędzi).
 */
export function AnalizyHeader({
  title,
  description,
  options,
  month,
}: {
  title: string;
  description: string;
  options: MonthOption[];
  month: string;
}) {
  return (
    <div className="flex justify-between gap-3 max-sm:flex-col sm:items-center">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <MonthSelector options={options} value={month} className="max-sm:self-end" />
    </div>
  );
}
