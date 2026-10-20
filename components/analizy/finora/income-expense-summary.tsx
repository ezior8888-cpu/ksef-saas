import { RiArrowDownCircleLine, RiArrowUpCircleLine, RiScales3Line } from '@remixicon/react';

import { POSITIVE_TEXT_TONE } from '@/components/dashboard/pulpit/stat-tile';
import { formatPlMoney } from '@/lib/format/pl';

import SpendingStreaksCard from './spending-streaks-card';

/**
 * Port Finory `monthly-analytics/income-expense-summary.tsx` („Income vs
 * Expense”) → „Przychody a koszty”: Przychody netto (§2.4 pkt 2, 4, 5),
 * Koszty jak w KPiR (§2.4 pkt 12) i Wynik — te same liczby co karta „Ten
 * miesiąc” na Pulpicie dla wybranego miesiąca.
 */
type IncomeExpenseSummaryProps = {
  income: number;
  expense: number;
  className?: string;
};

const IncomeExpenseSummary = ({ income, expense, className }: IncomeExpenseSummaryProps) => {
  const net = Math.round((income - expense) * 100) / 100 || 0;

  return (
    <SpendingStreaksCard
      title="Przychody a koszty"
      description="Netto, jak w KPiR · wybrany miesiąc"
      className={className}
      rows={[
        { icon: RiArrowUpCircleLine, iconClassName: POSITIVE_TEXT_TONE, title: 'Przychody', value: `${formatPlMoney(income)} zł` },
        { icon: RiArrowDownCircleLine, iconClassName: 'text-destructive', title: 'Koszty', value: `${formatPlMoney(expense)} zł` },
        { icon: RiScales3Line, iconClassName: 'text-foreground', title: 'Wynik', value: `${formatPlMoney(net)} zł` },
      ]}
    />
  );
};

export default IncomeExpenseSummary;
