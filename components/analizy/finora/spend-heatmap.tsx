'use client';

import { PulpitEmptyState } from '@/components/dashboard/pulpit/card-states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { heatmapIntensityClass, heatmapWeeks, type HeatmapDay } from '@/lib/analytics-finance/heatmap';
import { isoDatePl } from '@/lib/analytics-finance/months';
import { formatPlMoney } from '@/lib/format/pl';
import { cn } from '@/lib/utils';

import type { EmptyStateProps } from './empty';

/**
 * Port Finory `monthly-analytics/spend-heatmap.tsx` („Daily Spend”): siatka
 * CSS z komórką na dzień, kolumna na tydzień, natężenie wg kwantyla,
 * podpowiedź z datą i kwotą. Tydzień od poniedziałku (Finora: od niedzieli),
 * podpisy dni po polsku.
 */

/** Pn, Wt, Śr, Cz, Pt, So, Nd — jedna litera, jak w Finorze. */
const WEEKDAY_LABELS = ['P', 'W', 'Ś', 'C', 'P', 'S', 'N'];
const WEEKDAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];

type SpendHeatmapProps = {
  title: string;
  description: string;
  days: HeatmapDay[];
  empty: EmptyStateProps;
  className?: string;
};

const SpendHeatmap = ({ title, description, days, empty, className }: SpendHeatmapProps) => {
  const sortedPositive = days
    .map((day) => day.amount)
    .filter((amount) => amount > 0)
    .sort((a, b) => a - b);
  const weeks = heatmapWeeks(days);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {sortedPositive.length === 0 ? (
          <PulpitEmptyState {...empty} />
        ) : (
          // Odstępstwo od Finory (WCAG 2.1.1): siatka przewija się w bok, więc
          // kontener jest regionem z fokusem — przewinie się go strzałkami.
          <div
            role="region"
            aria-label={title}
            tabIndex={0}
            className="focus-visible:ring-ring/50 flex gap-2 overflow-x-auto rounded-sm pb-1 outline-none focus-visible:ring-[3px]"
          >
            <div className="flex flex-col gap-3.5" aria-hidden="true">
              {WEEKDAY_LABELS.map((label, index) => (
                <span
                  key={index}
                  title={WEEKDAY_NAMES[index]}
                  className="text-muted-foreground flex size-3.75 items-center justify-center text-xs leading-none"
                >
                  {label}
                </span>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-3.5">
                {week.map((day, weekdayIndex) => {
                  if (!day) return <div key={weekdayIndex} className="size-3.75" />;
                  const label = `${isoDatePl(day.date)} — ${formatPlMoney(day.amount)} zł`;

                  return (
                    <Tooltip key={day.date}>
                      <TooltipTrigger
                        render={
                          <div
                            role="img"
                            aria-label={label}
                            className={cn('size-3.75 rounded-sm', heatmapIntensityClass(day.amount, sortedPositive))}
                          />
                        }
                      />
                      <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SpendHeatmap;
