// Kopia 1:1 z finora-src/src/views/dashboards/widgets/widget-top-cash-flow-sources.tsx (Przepływy, decyzja Bartosza 21.10.2026): zmienione tylko teksty, kwoty, daty i importy.
// React Imports
import type { ReactElement } from 'react'

// Component Imports
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import CardHeaderWithMenu from '@/components/dashboard/finora/card-header-with-menu'

// Util Imports
import { cn } from '@/lib/utils'

type Props = {
  title: string
  sources: {
    icon: ReactElement
    sourceName: string
    sourceType: string
    amount: string
    share: number
    direction: 'in' | 'out'
    iconClassName?: string
  }[]
  className?: string
}

const TopCashFlowSourcesCard = ({ title, sources, className }: Props) => {
  return (
    <Card className={cn(className)}>
      <CardHeaderWithMenu title={title} />
      <CardContent className='flex flex-1 flex-col justify-evenly gap-5'>
        {sources.map((source, index) => (
          <div key={index} className='flex items-center justify-between gap-4'>
            <div className='flex items-center gap-3'>
              <Avatar className='size-10 after:border-0'>
                <AvatarFallback
                  className={cn('bg-primary/10 text-primary shrink-0 [&>svg]:size-4.5', source.iconClassName)}
                >
                  {source.icon}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span className='text-base'>{source.sourceName}</span>
                <span className='text-muted-foreground text-sm'>{source.sourceType}</span>
              </div>
            </div>
            <div className='flex flex-col items-end gap-2'>
              <span
                className={cn(
                  'text-sm',
                  source.direction === 'in' ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                )}
              >
                {source.direction === 'in' ? '+' : '-'}
                {source.amount}
              </span>
              <Progress
                value={source.share}
                className={cn(
                  'w-32 **:data-[slot=progress-track]:h-1.5',
                  source.direction === 'out' && '**:data-[slot=progress-indicator]:bg-chart-4'
                )}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default TopCashFlowSourcesCard
