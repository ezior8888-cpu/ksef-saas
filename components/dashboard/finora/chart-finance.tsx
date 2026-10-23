'use client'

// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { RiBankCardLine, RiMoneyDollarCircleLine, RiWalletLine } from '@remixicon/react'

// Component Imports
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { DemoBadge } from '@/components/dashboard/demo-badge'
import CardHeaderWithMenu, { type CardMenuItem } from './card-header-with-menu'
import { DymekWiersz } from './dymek'

// Util Imports
import { formatPlCompactNumber, formatPlMoney } from '@/lib/format/pl'
import { cn } from '@/lib/utils'

/**
 * Miesiąc wykresu „Finanse” (PLAN-PRAWDZIWE-DANE E5, Z17 po zmianie Bartosza
 * 23.10.2026): te same trzy serie w stosie, ale Koszty (netto) + Zysk (netto)
 * + VAT należny = sprzedaż brutto miesiąca. Słupki nie schodzą pod oś: przy
 * stracie zysk w słupku = 0, a strata jest w dymku (`result` < 0).
 */
export type FinanseMiesiac = {
  /** Podpis osi X, np. „Paź”. */
  month: string
  /** Słupek: zysk netto, ≥ 0. */
  profit: number
  /** Słupek: VAT należny, ≥ 0. */
  vat: number
  /** Słupek: koszty netto, ≥ 0. */
  costs: number
  /** Dymek: przychód netto. */
  revenue: number
  /** Dymek: przychód − koszty (ujemny = strata). */
  result: number
  /** Dymek: VAT należny ze znakiem (korekta może dać minus). */
  vatDue: number
  /** Dymek: koszty ze znakiem. */
  costsAmount: number
}

export type FinanceReportRow = {
  kind: 'profit' | 'revenue' | 'costs'
  title: string
  amount: string
}

export type FinanceCardProps = {
  subTitle: string
  /** Nazwa serii kosztów w dymku — z zastrzeżeniem „KSeF od DD.MM” (Z9). */
  costsLabel: string
  months: FinanseMiesiac[]
  report: { subTitle: string; rows: FinanceReportRow[] }
  financeMenu: CardMenuItem[]
  reportMenu: CardMenuItem[]
  /** D-P: plakietka „Dane przykładowe” w nagłówku „Finanse”. */
  demo?: boolean
  className?: string
}

export const financeChartConfig = {
  profit: {
    label: 'Zysk',
    color: 'var(--chart-2)'
  },
  vat: {
    label: 'VAT należny',
    color: 'var(--chart-3)'
  },
  costs: {
    label: 'Koszty',
    color: 'var(--chart-4)'
  }
} satisfies ChartConfig

const reportIcons: Record<FinanceReportRow['kind'], { icon: ReactNode; className: string }> = {
  profit: { icon: <RiMoneyDollarCircleLine className='size-4.5' />, className: 'bg-chart-2/10 text-chart-2' },
  revenue: { icon: <RiWalletLine className='size-4.5' />, className: 'bg-chart-3/10 text-chart-3' },
  costs: { icon: <RiBankCardLine className='size-4.5' />, className: 'bg-chart-4/10 text-chart-4' }
}

const zl = (n: number) => `${formatPlMoney(n)} zł`

/** Krok osi jak w recharts (1, 2, 2,5, 5 × 10ⁿ) — do oszacowania najdłuższej etykiety. */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = [1, 2, 2.5, 5, 10].find(u => u * power >= raw) ?? 10

  return unit * power
}

/**
 * Szerokość osi Y tylko tyle, by zmieściły się etykiety („125 tys.”). Dla
 * kwot poniżej tysiąca daje 30 px, czyli dokładnie dawne `margin left -30`
 * przy domyślnej szerokości osi 60.
 */
function yAxisWidth(max: number): number {
  const step = niceStep(max / 4)
  let longest = 1

  for (let tick = 0; tick <= max + step; tick += step) {
    longest = Math.max(longest, formatPlCompactNumber(tick).length)
  }

  return Math.max(30, Math.ceil(longest * 6 + 8))
}

const FinanceCard = ({ subTitle, costsLabel, months, report, financeMenu, reportMenu, demo, className }: FinanceCardProps) => {
  const config = { ...financeChartConfig, costs: { ...financeChartConfig.costs, label: costsLabel } } satisfies ChartConfig
  const max = Math.max(0, ...months.map(m => m.profit + m.vat + m.costs))

  return (
    <Card className={cn('grid grid-cols-1 gap-x-2 gap-y-4 lg:grid-cols-5', className)}>
      <div className='flex flex-col gap-10 max-lg:border-b max-lg:pb-6 lg:col-span-3 lg:border-r lg:pr-2'>
        <CardHeaderWithMenu title='Finanse' subTitle={subTitle} menuItems={financeMenu} badge={demo ? <DemoBadge skracana /> : undefined} className='flex justify-between' />
        <CardContent className='flex-1'>
          <ChartContainer config={config} className='h-full min-h-65 w-full'>
            <BarChart accessibilityLayer data={months} barSize={12} margin={{ left: 0, bottom: -5 }}>
              <CartesianGrid vertical={false} strokeDasharray='4' stroke='var(--border)' />
              <XAxis
                dataKey='month'
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={value => String(value).slice(0, 3)}
                tick={{ fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                width={yAxisWidth(max)}
                tickFormatter={value => formatPlCompactNumber(Number(value))}
                tickLine={false}
                tickMargin={8}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)' }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(_value, name, item) => {
                      const m = item.payload as FinanseMiesiac

                      if (name === 'profit') {
                        return <DymekWiersz color={item.color} label={m.result < 0 ? 'Strata' : 'Zysk'} value={zl(Math.abs(m.result))} />
                      }

                      if (name === 'vat') return <DymekWiersz color={item.color} label='VAT należny' value={zl(m.vatDue)} />

                      return <DymekWiersz color={item.color} label={costsLabel} value={zl(m.costsAmount)} />
                    }}
                  />
                }
              />
              <Bar dataKey='profit' stackId='a' fill='var(--color-profit)' />
              <Bar dataKey='vat' stackId='a' fill='var(--color-vat)' />
              <Bar dataKey='costs' stackId='a' fill='var(--color-costs)' />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </div>
      <div className='flex flex-col gap-10 lg:col-span-2'>
        <CardHeaderWithMenu title='Raport' subTitle={report.subTitle} menuItems={reportMenu} className='flex justify-between' />
        <CardContent className='flex flex-1 flex-col justify-between gap-6 text-base'>
          {report.rows.map((row, index) => (
            <div key={index} className='flex items-center gap-3'>
              <Avatar className='size-9 after:border-0'>
                <AvatarFallback
                  className={cn('bg-primary/10 text-primary shrink-0 [&>svg]:size-4.5', reportIcons[row.kind].className)}
                >
                  {reportIcons[row.kind].icon}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span>{row.title}</span>
                <span className='text-muted-foreground text-sm'>{row.amount}</span>
              </div>
            </div>
          ))}

          {/* E7 pkt 2: przycisk bez celu → link, ten sam wygląd (`data-slot` dla odstępów z globals.css). */}
          <Link href='/przeplywy' data-slot='button' data-variant='default' data-size='lg' className={buttonVariants({ size: 'lg' })}>
            Zobacz przepływy
          </Link>
        </CardContent>
      </div>
    </Card>
  )
}

export default FinanceCard
