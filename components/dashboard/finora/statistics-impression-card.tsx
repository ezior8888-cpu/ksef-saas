'use client'

// Third-party Imports
import { Line, LineChart } from 'recharts'

// Component Imports
import { Card, CardDescription, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

// Impression chart data
const impressionChartData = [
  { month: 'Styczeń', impression: 20 },
  { month: 'Luty', impression: 20 },
  { month: 'Marzec', impression: 50 },
  { month: 'Kwiecień', impression: 50 },
  { month: 'Maj', impression: 30 },
  { month: 'Czerwiec', impression: 30 },
  { month: 'Lipiec', impression: 5 },
  { month: 'Sierpień', impression: 5 },
  { month: 'Wrzesień', impression: 50 },
  { month: 'Październik', impression: 50 },
  { month: 'Listopad', impression: 105 },
  { month: 'Grudzień', impression: 105 }
]

const impressionChartConfig = {
  impression: {
    label: 'Wyświetlenia',
    color: 'var(--chart-5)'
  }
} satisfies ChartConfig

const StatisticsCardData = {
  title: 'Wyświetlenia',
  description: 'Ostatni rok',
  children: (
    <>
      <ChartContainer config={impressionChartConfig} className='h-21 w-full'>
        <LineChart
          accessibilityLayer
          data={impressionChartData}
          margin={{
            left: 4,
            right: 4
          }}
        >
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Line dataKey='impression' type='linear' dot={false} stroke='var(--color-impression)' strokeWidth={3} />
        </LineChart>
      </ChartContainer>
    </>
  ),
  value: '175 tys.',
  changePercentage: '+24%'
}

const StatisticsImpressionCard = ({ className }: { className?: string }) => {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className='text-lg font-semibold'>{StatisticsCardData.title}</CardTitle>
        <CardDescription className='text-muted-foreground text-base'>{StatisticsCardData.description}</CardDescription>
      </CardHeader>
      <CardContent>{StatisticsCardData.children}</CardContent>

      <CardContent className='flex items-center justify-between'>
        <span className='text-xl font-semibold'>{StatisticsCardData.value}</span>
        <span className='text-primary text-base'>{StatisticsCardData.changePercentage}</span>
      </CardContent>
    </Card>
  )
}

export default StatisticsImpressionCard
