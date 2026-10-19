'use client'

// Third-party Imports
import { Bar, BarChart } from 'recharts'

// Component Imports
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

// Util Imports
import { cn } from '@/lib/utils'

// Revenue chart data
const revenueChartData = [
  { month: 'Styczeń', desktop: 120, mobile: 80 },
  { month: 'Luty', desktop: 164, mobile: 120 },
  { month: 'Marzec', desktop: 99, mobile: 138 },
  { month: 'Kwiecień', desktop: 48, mobile: 80 },
  { month: 'Maj', desktop: 160, mobile: 141 }
]

const revenueChartConfig = {
  desktop: {
    label: 'Komputer',
    color: 'var(--chart-2)'
  },
  mobile: {
    label: 'Telefon',
    color: 'color-mix(in oklab, var(--chart-2) 20%, transparent)'
  }
} satisfies ChartConfig

const StatisticsCardData = {
  title: '42,5 tys. zł',
  description: 'Przychód łącznie',
  children: (
    <>
      <ChartContainer config={revenueChartConfig} className='h-31 w-full'>
        <BarChart
          accessibilityLayer
          data={revenueChartData}
          barSize={12}
          margin={{
            left: 0,
            right: 0
          }}
          barGap={0}
        >
          <Bar dataKey='desktop' fill='var(--color-desktop)' radius={[12, 12, 0, 0]} />
          <Bar dataKey='mobile' fill='var(--color-mobile)' radius={[12, 12, 0, 0]} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        </BarChart>
      </ChartContainer>
    </>
  ),
  changePercentage: '-22%'
}

const StatisticsTotalRevenueCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('justify-between', className)}>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <CardTitle className='text-lg font-semibold'>{StatisticsCardData.title}</CardTitle>
          <span className='text-base'>{StatisticsCardData.changePercentage}</span>
        </div>
        <CardDescription className='text-muted-foreground text-base'>{StatisticsCardData.description}</CardDescription>
      </CardHeader>
      <CardContent>{StatisticsCardData.children}</CardContent>
    </Card>
  )
}

export default StatisticsTotalRevenueCard
