'use client'

// Third-party Imports
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { RiBankCardLine, RiMoneyDollarCircleLine, RiWalletLine } from '@remixicon/react'

// Component Imports
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import CardHeaderWithMenu from './card-header-with-menu'

// Util Imports
import { cn } from '@/lib/utils'

const financeChartData = [
  { month: 'Styczeń', profit: 20, income: 0, expense: 0 },
  { month: 'Luty', profit: 20, income: 8, expense: 0 },
  { month: 'Marzec', profit: 18, income: 22, expense: 0 },
  { month: 'Kwiecień', profit: 12, income: 13, expense: 0 },
  { month: 'Maj', profit: 22, income: 18, expense: 4 },
  { month: 'Czerwiec', profit: 15, income: 22, expense: 13 },
  { month: 'Lipiec', profit: 25, income: 7, expense: 12 }
]

const financeChartConfig = {
  profit: {
    label: 'Zysk',
    color: 'var(--chart-2)'
  },
  income: {
    label: 'Przychody',
    color: 'var(--chart-3)'
  },
  expense: {
    label: 'Koszty',
    color: 'var(--chart-4)'
  }
} satisfies ChartConfig

const ReportData = [
  {
    icons: <RiMoneyDollarCircleLine className='size-4.5' />,
    title: 'Zysk łącznie',
    amount: '48 568,20 zł',
    iconClassName: 'bg-chart-2/10 text-chart-2'
  },
  {
    icons: <RiWalletLine className='size-4.5' />,
    title: 'Przychody łącznie',
    amount: '38 453,25 zł',
    iconClassName: 'bg-chart-3/10 text-chart-3'
  },
  {
    icons: <RiBankCardLine className='size-4.5' />,
    title: 'Koszty łącznie',
    amount: '2453,45 zł',
    iconClassName: 'bg-chart-4/10 text-chart-4'
  }
]

const FinanceCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('grid grid-cols-1 gap-x-2 gap-y-4 lg:grid-cols-5', className)}>
      <div className='flex flex-col gap-10 max-lg:border-b max-lg:pb-6 lg:col-span-3 lg:border-r lg:pr-2'>
        <CardHeaderWithMenu title='Finanse' subTitle='Przegląd roczny' className='flex justify-between' />
        <CardContent className='flex-1'>
          <ChartContainer config={financeChartConfig} className='h-full min-h-65 w-full'>
            <BarChart accessibilityLayer data={financeChartData} barSize={12} margin={{ left: -30, bottom: -5 }}>
              <CartesianGrid vertical={false} strokeDasharray='4' stroke='var(--border)' />
              <XAxis
                dataKey='month'
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={value => value.slice(0, 3)}
                tick={{ fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                domain={[0, 50]}
                ticks={[0, 10, 20, 30, 40, 50]}
                tickFormatter={value => value}
                tickLine={false}
                tickMargin={8}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)' }}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey='profit' stackId='a' fill='var(--color-profit)' />
              <Bar dataKey='income' stackId='a' fill='var(--color-income)' />
              <Bar dataKey='expense' stackId='a' fill='var(--color-expense)' />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </div>
      <div className='flex flex-col gap-10 lg:col-span-2'>
        <CardHeaderWithMenu title='Raport' subTitle='Średnio miesięcznie: 45,6 tys. zł' className='flex justify-between' />
        <CardContent className='flex flex-1 flex-col justify-between gap-6 text-base'>
          {ReportData.map((report, index) => (
            <div key={index} className='flex items-center gap-3'>
              <Avatar className='size-9 after:border-0'>
                <AvatarFallback
                  className={cn('bg-primary/10 text-primary shrink-0 [&>svg]:size-4.5', report.iconClassName)}
                >
                  {report.icons}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span>{report.title}</span>
                <span className='text-muted-foreground text-sm'>{report.amount}</span>
              </div>
            </div>
          ))}

          <Button size='lg'>Zobacz raport</Button>
        </CardContent>
      </div>
    </Card>
  )
}

export default FinanceCard
