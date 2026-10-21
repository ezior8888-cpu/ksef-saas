// Kopia 1:1 z finora-src/src/views/dashboards/widgets/widget-recent-activity.tsx (Przepływy, decyzja Bartosza 21.10.2026): zmienione tylko teksty, kwoty, daty i importy.

// React Imports
import type { ReactElement } from 'react'

// Third-party Imports
import { RiArrowDownLine, RiArrowUpLine } from '@remixicon/react'

// Component Imports
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import CardHeaderWithMenu from '@/components/dashboard/finora/card-header-with-menu'

// Util Imports
import { cn } from '@/lib/utils'

type Props = {
  title: string
  activity: {
    icon: ReactElement
    label: string
    subLabel: string
    amount: string
    direction: 'in' | 'out'
    iconClassName?: string
  }[]
  className?: string
}

const RecentActivityCard = ({ title, activity, className }: Props) => {
  return (
    <Card className={cn(className)}>
      <CardHeaderWithMenu title={title} />
      <CardContent className='flex flex-1 flex-col justify-between gap-4'>
        {activity.map((item, index) => (
          <div key={index} className='flex items-center justify-between gap-2'>
            <div className='flex items-center justify-between gap-3'>
              <Avatar className='size-9 after:border-0'>
                <AvatarFallback
                  className={cn('bg-primary/10 text-primary shrink-0 [&>svg]:size-4.5', item.iconClassName)}
                >
                  {item.icon}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span className='text-base'>{item.label}</span>
                <span className='text-muted-foreground text-sm'>{item.subLabel}</span>
              </div>
            </div>
            <div className='flex items-center gap-2 text-sm'>
              <span>
                {item.direction === 'out' ? '-' : '+'}
                {item.amount}
              </span>
              <div className='bg-muted text-primary flex size-6 shrink-0 items-center justify-center rounded-full'>
                {item.direction === 'out' ? (
                  <RiArrowDownLine className='size-4' />
                ) : (
                  <RiArrowUpLine className='size-4' />
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default RecentActivityCard
