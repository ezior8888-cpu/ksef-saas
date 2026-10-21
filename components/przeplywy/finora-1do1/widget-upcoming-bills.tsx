// Kopia 1:1 z finora-src/src/views/dashboards/widgets/widget-upcoming-bills.tsx (Przepływy, decyzja Bartosza 21.10.2026): zmienione tylko teksty, kwoty, daty i importy.
// React Imports
import type { ReactElement } from 'react'

// Component Imports
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import CardHeaderWithMenu from '@/components/dashboard/finora/card-header-with-menu'

// Util Imports
import { cn } from '@/lib/utils'

type Props = {
  title: string
  subTitle: string
  bills: {
    icon: ReactElement
    title: string
    dueDate: string
    amount: string
    iconClassName?: string
  }[]
  className?: string
}

const UpcomingBillsCard = ({ title, subTitle, bills, className }: Props) => {
  return (
    <Card className={cn(className)}>
      <CardHeaderWithMenu title={title} subTitle={subTitle} />
      <CardContent className='flex flex-1 flex-col justify-between gap-4'>
        {bills.map((bill, index) => (
          <div key={index} className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-3'>
              <Avatar className='size-9 after:border-0'>
                <AvatarFallback
                  className={cn('bg-primary/10 text-primary shrink-0 [&>svg]:size-4.5', bill.iconClassName)}
                >
                  {bill.icon}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span className='text-base'>{bill.title}</span>
                <span className='text-muted-foreground text-sm'>{bill.dueDate}</span>
              </div>
            </div>
            <span className='text-sm font-medium'>{bill.amount}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default UpcomingBillsCard
