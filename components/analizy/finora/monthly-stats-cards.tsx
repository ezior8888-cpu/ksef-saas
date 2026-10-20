import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiCalendarLine,
  RiFileList3Line,
  RiPriceTag3Line,
  RiUser3Line,
  RiWalletLine,
} from '@remixicon/react';

import StatsCards, { type StatItem } from '@/components/dashboard/stats-cards';
import type { CostMonthStats } from '@/lib/analytics-finance/costs';
import type { SalesMonthStats } from '@/lib/analytics-finance/sales';
import { formatPlCompactMoney, formatPlMoney, formatPlPercentChange } from '@/lib/format/pl';

/**
 * Port Finory `monthly-analytics/monthly-stats-cards.tsx` (4 kafle
 * w `views/stats-cards.tsx`) — dwa warianty: koszty (P10) i sprzedaż (P11).
 * Kwoty w skrócie (`formatPlCompactMoney`, §7.1) z pełną kwotą w `title`.
 * Finora pokazuje „0%” bez poprzedniego miesiąca; u nas „—” z podpisem,
 * bo procent bez podstawy nie istnieje.
 */

function money(value: number): Pick<StatItem, 'value' | 'valueTitle'> {
  return { value: formatPlCompactMoney(value), valueTitle: `${formatPlMoney(value)} zł` };
}

function change(pct: number | null, missingNote: string): Pick<StatItem, 'value' | 'icon' | 'note'> {
  if (pct === null) return { value: '—', icon: RiArrowUpLine, note: missingNote };
  return { value: formatPlPercentChange(pct), icon: Math.round(pct) < 0 ? RiArrowDownLine : RiArrowUpLine };
}

export const CostStatsCards = ({ stats, className }: { stats: CostMonthStats; className?: string }) => {
  const items: StatItem[] = [
    { label: 'Wydano (brutto)', icon: RiWalletLine, ...money(stats.total) },
    { label: 'Średnio dziennie', icon: RiCalendarLine, ...money(stats.avgDaily) },
    { label: 'vs poprzedni miesiąc', ...change(stats.changePct, 'Brak wydatków w poprzednim miesiącu') },
    {
      label: 'Największa kategoria',
      value: stats.topCategory ?? '—',
      valueTitle: stats.topCategory ?? undefined,
      valueClassName: 'truncate',
      icon: RiPriceTag3Line,
    },
  ];
  return <StatsCards stats={items} className={className} />;
};

export const SalesStatsCards = ({ stats, className }: { stats: SalesMonthStats; className?: string }) => {
  const items: StatItem[] = [
    { label: 'Sprzedano (netto)', icon: RiWalletLine, ...money(stats.total) },
    {
      label: 'Średnio na fakturę',
      icon: RiFileList3Line,
      ...(stats.avgPerInvoice === null ? { value: '—' } : money(stats.avgPerInvoice)),
    },
    { label: 'vs poprzedni miesiąc', ...change(stats.changePct, 'Brak sprzedaży w poprzednim miesiącu') },
    {
      label: 'Najlepszy klient',
      value: stats.bestClient ?? '—',
      valueTitle: stats.bestClient ?? undefined,
      valueClassName: 'truncate',
      icon: RiUser3Line,
    },
  ];
  return <StatsCards stats={items} className={className} />;
};
