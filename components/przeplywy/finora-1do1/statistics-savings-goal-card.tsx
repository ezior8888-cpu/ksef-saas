// Kopia 1:1 z finora-src/src/views/dashboards/statistics/statistics-savings-goal-card.tsx (Przepływy, decyzja Bartosza 21.10.2026): zmienione tylko teksty, kwoty, daty i importy.
'use client'

// Third-party Imports
import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'

// Component Imports
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer } from '@/components/ui/chart'

// Util Imports
import { cn } from '@/lib/utils'

const savingsGoalChartData = [{ progress: 68, fill: 'var(--color-progress)' }]

const savingsGoalChartConfig = {
  progress: {
    label: 'Postęp',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig

const StatisticsCardData = {
  title: 'Cel oszczędnościowy',
  description: 'Fundusz awaryjny',
  value: '6,8 tys. zł',
  target: '10 tys. zł',
  changePercentage: '+68%'
}

const StatisticsSavingsGoalCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className='text-lg font-semibold'>{StatisticsCardData.title}</CardTitle>
        <CardDescription className='text-muted-foreground text-base'>{StatisticsCardData.description}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col items-center justify-center gap-2'>
        <ChartContainer config={savingsGoalChartConfig} className='mx-auto aspect-square h-62 w-62'>
          <RadialBarChart data={savingsGoalChartData} startAngle={90} endAngle={335} innerRadius={115} outerRadius={86}>
            <PolarGrid
              gridType='circle'
              radialLines={false}
              stroke='none'
              className='first:fill-primary/10 last:fill-card'
              polarRadius={[113, 88]}
            />
            <RadialBar dataKey='progress' cornerRadius={14} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor='middle' dominantBaseline='middle'>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 18}
                          className='fill-foreground text-4xl font-semibold'
                        >
                          {savingsGoalChartData[0].progress}%
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 16}
                          className='fill-foreground text-xl font-medium'
                        >
                          {StatisticsCardData.value}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 38} className='fill-muted-foreground text-sm'>
                          z celu {StatisticsCardData.target}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
        <span className='text-primary text-sm font-medium'>{StatisticsCardData.changePercentage} wobec poprzedniego miesiąca</span>
      </CardContent>
    </Card>
  )
}

export default StatisticsSavingsGoalCard
