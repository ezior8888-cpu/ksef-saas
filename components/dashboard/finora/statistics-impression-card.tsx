'use client'

// Third-party Imports
import { Line, LineChart } from 'recharts'

// Component Imports
import { Card, CardDescription, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { DymekWiersz } from './dymek'

// Util Imports
import { formatPlMoney } from '@/lib/format/pl'

export type LiniaPunkt = {
  /** Podpis miesiąca, np. „Paź”. */
  month: string
  value: number
}

/**
 * Karta z linią (dawne „Wyświetlenia”, PLAN-PRAWDZIWE-DANE E5): VAT należny
 * z 12 miesięcy albo, u firmy zwolnionej z VAT, limit zwolnienia — sprzedaż
 * narastająco od 1 stycznia.
 */
export type StatisticsImpressionCardProps = {
  title: string
  description: string
  value: string
  valueTitle?: string
  /** Napis po prawej (zmiana m/m albo limit); `null` → pusto. */
  side: string | null
  /** Kolor napisu po prawej ze znaku zmiany: spadek → `destructive`. */
  sideTone: 'primary' | 'destructive'
  /** Nazwa serii w dymku. */
  seriesLabel: string
  points: LiniaPunkt[]
  className?: string
}

const StatisticsImpressionCard = ({
  title,
  description,
  value,
  valueTitle,
  side,
  sideTone,
  seriesLabel,
  points,
  className
}: StatisticsImpressionCardProps) => {
  const config = {
    value: {
      label: seriesLabel,
      color: 'var(--chart-5)'
    }
  } satisfies ChartConfig

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className='text-lg font-semibold'>{title}</CardTitle>
        <CardDescription className='text-muted-foreground text-base'>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className='h-21 w-full'>
          <LineChart
            accessibilityLayer
            data={points}
            margin={{
              left: 4,
              right: 4
            }}
          >
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => String(payload?.[0]?.payload?.month ?? '')}
                  formatter={(itemValue, _name, item) => (
                    <DymekWiersz color={item.color} label={seriesLabel} value={`${formatPlMoney(Number(itemValue))} zł`} />
                  )}
                />
              }
            />
            <Line dataKey='value' type='linear' dot={false} stroke='var(--color-value)' strokeWidth={3} />
          </LineChart>
        </ChartContainer>
      </CardContent>

      <CardContent className='flex items-center justify-between'>
        <span className='text-xl font-semibold' title={valueTitle}>
          {value}
        </span>
        <span className={sideTone === 'destructive' ? 'text-destructive text-base' : 'text-primary text-base'}>{side}</span>
      </CardContent>
    </Card>
  )
}

export default StatisticsImpressionCard
