'use client'

// Kopia 1:1 z finora-src/src/views/dashboards/charts/chart-cash-flow.tsx (Przepływy, decyzja Bartosza 21.10.2026): zmienione tylko teksty, kwoty, daty i importy.

// Third-party Imports
import { Bar, BarChart, XAxis, YAxis } from 'recharts'

// Component Imports
import { Card, CardContent } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CardHeaderWithMenu from '@/components/dashboard/finora/card-header-with-menu'

// Util Imports
import { cn } from '@/lib/utils'

const weeklyData = [
  { label: 'pon', inflow: 620, outflow: 480 },
  { label: 'wto', inflow: 340, outflow: 520 },
  { label: 'śro', inflow: 780, outflow: 240 },
  { label: 'czw', inflow: 410, outflow: 670 },
  { label: 'pią', inflow: 890, outflow: 280 },
  { label: 'sob', inflow: 460, outflow: 320 },
  { label: 'nie', inflow: 300, outflow: 390 }
]

const monthlyData = [
  { label: 'sty', inflow: 3200, outflow: 2400 },
  { label: 'lut', inflow: 2800, outflow: 2400 },
  { label: 'mar', inflow: 3500, outflow: 2000 },
  { label: 'kwi', inflow: 2600, outflow: 3250 },
  { label: 'maj', inflow: 3800, outflow: 2100 },
  { label: 'cze', inflow: 3000, outflow: 3420 },
  { label: 'lip', inflow: 3400, outflow: 1900 }
]

const yearlyData = [
  { label: '2021', inflow: 28400, outflow: 24200 },
  { label: '2022', inflow: 31200, outflow: 33000 },
  { label: '2023', inflow: 36400, outflow: 30000 },
  { label: '2024', inflow: 39100, outflow: 36000 },
  { label: '2025', inflow: 34600, outflow: 26180 }
]

const cashFlowChartConfig = {
  inflow: {
    label: 'Wpływy',
    color: 'var(--chart-2)'
  },
  outflow: {
    label: 'Wydatki',
    color: 'var(--chart-4)'
  }
} satisfies ChartConfig

const tabsData = [
  { value: 'weekly', label: 'Tygodniowo', data: weeklyData },
  { value: 'monthly', label: 'Miesięcznie', data: monthlyData },
  { value: 'yearly', label: 'Rocznie', data: yearlyData }
]

const totalInflow = monthlyData.reduce((sum, item) => sum + item.inflow, 0)
const totalOutflow = monthlyData.reduce((sum, item) => sum + item.outflow, 0)

const formatPln = (value: number) => `${value.toLocaleString('pl-PL')} zł`

const CashFlowCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn(className)}>
      <CardHeaderWithMenu title='Przepływy pieniężne' subTitle='Wpływy i wydatki w czasie' />

      <Tabs defaultValue='monthly' className='gap-6'>
        <CardContent className='flex flex-wrap items-center justify-between gap-4'>
          <div className='flex items-center gap-6'>
            <div className='flex items-center gap-2'>
              <span className='bg-chart-2 h-8 w-1 rounded-full' />
              <div className='flex flex-col'>
                <span className='text-xl font-semibold'>{formatPln(totalInflow)}</span>
                <span className='text-muted-foreground text-sm'>Suma wpływów</span>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <span className='bg-chart-4 h-8 w-1 rounded-full' />
              <div className='flex flex-col'>
                <span className='text-xl font-semibold'>{formatPln(totalOutflow)}</span>
                <span className='text-muted-foreground text-sm'>Suma wydatków</span>
              </div>
            </div>
          </div>

          <TabsList>
            {tabsData.map(tab => (
              <TabsTrigger className='shadow-none' key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </CardContent>

        <CardContent>
          {tabsData.map(tab => (
            <TabsContent key={tab.value} value={tab.value}>
              <ChartContainer config={cashFlowChartConfig} className='h-65 w-full'>
                <BarChart accessibilityLayer data={tab.data} barGap={4} margin={{ left: -20, right: 0, bottom: -5 }}>
                  <XAxis
                    dataKey='label'
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tick={{ fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: 'var(--muted-foreground)' }} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar dataKey='inflow' fill='var(--color-inflow)' radius={4} />
                  <Bar dataKey='outflow' fill='var(--color-outflow)' radius={4} />
                </BarChart>
              </ChartContainer>
            </TabsContent>
          ))}
        </CardContent>
      </Tabs>
    </Card>
  )
}

export default CashFlowCard
