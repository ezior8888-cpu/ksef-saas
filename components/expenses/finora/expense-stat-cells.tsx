import { cache } from 'react'
import { RiArrowLeftDownLine, RiArrowRightUpLine, RiCalendarScheduleLine, RiFileEditLine } from '@remixicon/react'

import { countExpensesToReview, getExpenseMonthStats } from '@/lib/dashboard/expense-stats'
import { formatPlCompactMoney, formatPlInt, formatPlMoney } from '@/lib/format/pl'
import { plural } from '@/lib/i18n/plural'
import type { PageContext } from '@/lib/supabase/page-context'

import { loadStatCell, StatSlot } from './stat-slot'
import { StatsCardsFrame } from './stats-cards'

/**
 * Kafle Wydatków (P8 ← Finora `transaction-stats-cards.tsx`: Money In /
 * Money Out / Net / Upcoming → Wydatki w miesiącu / VAT do odliczenia /
 * Do opisania / Stałe koszty). Kwoty z `getExpenseMonthStats` (§2.4 pkt 12),
 * nie z listy na stronie. Trzy kafle kosztów czytają jedno zapytanie przez
 * `cache()`; wyjątek i tak trafia osobno do każdego z nich.
 */

export interface ExpenseStatsProps {
  supabase: PageContext['supabase']
  tenantId: string
  /** Miesiąc RRRR-MM wybrany na liście (domyślnie bieżący w Europe/Warsaw). */
  month: string
}

const loadMonthStats = cache((supabase: PageContext['supabase'], tenantId: string, month: string) =>
  getExpenseMonthStats(supabase, tenantId, month))

const money = (n: number) => `${formatPlMoney(n)} zł`

export const EXPENSE_COSTS_NOTE = 'Tylko koszty w KPiR'

export async function ExpensesGrossCell({ supabase, tenantId, month }: ExpenseStatsProps) {
  return loadStatCell('Wydatki w miesiącu', async () => {
    const stats = await loadMonthStats(supabase, tenantId, month)
    return {
      value: formatPlCompactMoney(stats.gross),
      valueTitle: money(stats.gross),
      note: `Brutto · ${EXPENSE_COSTS_NOTE}`,
      icon: RiArrowRightUpLine
    }
  })
}

export async function ExpensesVatCell({ supabase, tenantId, month }: ExpenseStatsProps) {
  return loadStatCell('VAT do odliczenia', async () => {
    const stats = await loadMonthStats(supabase, tenantId, month)
    return {
      value: formatPlCompactMoney(stats.vatDeductible),
      valueTitle: money(stats.vatDeductible),
      note: 'Z faktur, jak w JPK_V7M',
      icon: RiArrowLeftDownLine
    }
  })
}

export async function ExpensesToReviewCell({ supabase, tenantId }: Omit<ExpenseStatsProps, 'month'>) {
  return loadStatCell('Do opisania', async () => {
    const count = await countExpensesToReview(supabase, tenantId)
    return {
      value: formatPlInt(count),
      note: count > 0 ? `${count} ${plural(count, ['wydatek czeka', 'wydatki czekają', 'wydatków czeka'])} na sprawdzenie` : 'Wszystko opisane',
      icon: RiFileEditLine
    }
  })
}

export async function ExpensesRecurringCell({ supabase, tenantId, month }: ExpenseStatsProps) {
  return loadStatCell('Stałe koszty', async () => {
    const stats = await loadMonthStats(supabase, tenantId, month)
    const count = stats.recurring.length
    if (count === 0) {
      return {
        value: '—',
        note: 'Pokażemy, gdy dostawca wróci w 3 z 4 miesięcy',
        icon: RiCalendarScheduleLine
      }
    }
    return {
      value: formatPlCompactMoney(stats.recurringTotal),
      valueTitle: `${money(stats.recurringTotal)} miesięcznie`,
      note: `Miesięcznie · ${count} ${plural(count, ['dostawca', 'dostawcy', 'dostawców'])}`,
      icon: RiCalendarScheduleLine
    }
  })
}

/** Karta Finory z czterema kafelkami — każdy we własnej granicy błędu. */
export function ExpenseStatsCards({ className, ...props }: ExpenseStatsProps & { className?: string }) {
  return (
    <StatsCardsFrame
      className={className}
      cells={[
        <StatSlot key='gross' label='Wydatki w miesiącu'>
          <ExpensesGrossCell {...props} />
        </StatSlot>,
        <StatSlot key='vat' label='VAT do odliczenia'>
          <ExpensesVatCell {...props} />
        </StatSlot>,
        <StatSlot key='review' label='Do opisania'>
          <ExpensesToReviewCell supabase={props.supabase} tenantId={props.tenantId} />
        </StatSlot>,
        <StatSlot key='recurring' label='Stałe koszty'>
          <ExpensesRecurringCell {...props} />
        </StatSlot>
      ]}
    />
  )
}
