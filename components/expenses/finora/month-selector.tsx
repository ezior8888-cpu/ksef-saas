'use client'

// React Imports
import { useTransition } from 'react'

// Third-party Imports
import { useRouter } from 'next/navigation'

// Component Imports
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Utils Imports
import { monthLabel, shiftMonth } from '@/lib/expenses/month'
import { cn } from '@/lib/utils'

/**
 * Port `src/views/pages/money-management/monthly-analytics/month-selector.tsx`
 * z Finory. Zamiast `nuqs` (plan §10.1: nie dodajemy) adres zmienia
 * `router.push` — miesiąc dalej siedzi w `?miesiac=RRRR-MM`, jak na liście
 * wydatków od F-087. Lista ma 24 miesiące wstecz (Finora: 6), bo wydatki
 * sprzed pół roku też się opisuje; miesiąc z adresu spoza listy dochodzi na
 * jej koniec, żeby wybór był zawsze widoczny.
 */

type MonthSelectorProps = {
  /** Wybrany miesiąc RRRR-MM. */
  month: string
  /** Bieżący miesiąc RRRR-MM (Europe/Warsaw) — początek listy. */
  currentMonth: string
  /** Ścieżka listy, np. `/expenses` — miesiąc dochodzi jako `?miesiac=RRRR-MM`. */
  basePath: string
  className?: string
}

const MONTHS_BACK = 24

export function monthOptions(currentMonth: string, selected: string): { label: string; value: string }[] {
  const options = Array.from({ length: MONTHS_BACK }, (_, index) => {
    const value = shiftMonth(currentMonth, -index)

    return { label: capitalize(monthLabel(value)), value }
  })

  if (!options.some(option => option.value === selected)) {
    options.push({ label: capitalize(monthLabel(selected)), value: selected })
  }

  return options
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('pl-PL') + text.slice(1)
}

const MonthSelector = ({ month, currentMonth, basePath, className }: MonthSelectorProps) => {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const options = monthOptions(currentMonth, month)

  return (
    <Select
      items={options}
      value={month}
      disabled={isPending}
      onValueChange={value => {
        if (value) startTransition(() => router.push(`${basePath}?miesiac=${value}`))
      }}
    >
      <SelectTrigger className={cn('w-48', className)} aria-label='Miesiąc wydatków'>
        <SelectValue placeholder='Wybierz miesiąc' />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className='p-1'>
        <SelectGroup>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export default MonthSelector
