import type { ChartConfig } from '@/components/ui/chart';
import type { BreakdownSlice } from '@/lib/analytics-finance/breakdown';

/**
 * Kolory wykresów kołowych analiz (Finora: `EXPENSE_CATEGORY_COLOR_VAR`
 * i `assetAllocationConfig`): miejsce w rankingu → `chart-1…5`, pozycja
 * „Pozostałe” → `muted-foreground`.
 */

/** Klucz serii w `ChartConfig` — nazwy kategorii nie nadają się na zmienne CSS. */
export function sliceSlot(slice: BreakdownSlice, index: number): string {
  return slice.other ? 'other' : `s${index}`;
}

export function sliceChartConfig(data: readonly BreakdownSlice[]): ChartConfig {
  return data.reduce<ChartConfig>((config, slice, index) => {
    config[sliceSlot(slice, index)] = {
      label: slice.label,
      color: slice.other ? 'var(--muted-foreground)' : `var(--chart-${(index % 5) + 1})`,
    };
    return config;
  }, {});
}
