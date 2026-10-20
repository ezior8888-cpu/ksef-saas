// React Imports
import type { ReactElement } from 'react'

// Component Imports
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import CardHeaderWithMenu from './card-header-with-menu'

// Util Imports
import { cn } from '@/lib/utils'

type Props = {
  salesTitle: string
  productsBySalesData: {
    icon: ReactElement
    productName: string
    productBrand: string
    sales: string
    iconClassName?: string
  }[]
  volumeTitle: string
  productsByVolumeData: {
    icon: ReactElement
    productName: string
    productBrand: string
    volume: string
    changePercentage: number
    iconClassName?: string
  }[]
  className?: string
}

const TopProductsCard = ({ salesTitle, productsBySalesData, volumeTitle, productsByVolumeData, className }: Props) => {
  return (
    <Card className={cn('gap-x-2 gap-y-6 lg:flex-row', className)}>
      {/* Products by sales card */}
      <div className='flex flex-1 flex-col gap-9'>
        <CardHeaderWithMenu title={salesTitle} />
        <CardContent className='flex flex-1 flex-col justify-between gap-4'>
          {productsBySalesData.map((product, index) => (
            <div key={index} className='flex items-center justify-between gap-2'>
              <div className='flex items-center justify-between gap-3'>
                <Avatar className='size-9 after:border-0'>
                  <AvatarFallback
                    className={cn('bg-primary/10 text-primary shrink-0 [&>svg]:size-4.5', product.iconClassName)}
                  >
                    {product.icon}
                  </AvatarFallback>
                </Avatar>
                <div className='flex flex-col'>
                  <span className='text-base'>{product.productName}</span>
                  <span className='text-muted-foreground text-sm'>{product.productBrand}</span>
                </div>
              </div>
              <span className='text-sm'>{product.sales}</span>
            </div>
          ))}
        </CardContent>
      </div>
      <div className='flex max-lg:px-6'>
        <Separator orientation='vertical' className='hidden lg:block' />
        <Separator className='block lg:hidden' />
      </div>
      {/* Products by volume card */}
      <div className='flex flex-1 flex-col gap-9'>
        <CardHeaderWithMenu title={volumeTitle} />
        <CardContent className='flex flex-1 flex-col justify-between gap-4'>
          {productsByVolumeData.map((product, index) => (
            <div key={index} className='flex items-center justify-between gap-2'>
              <div className='flex items-center justify-between gap-3'>
                <Avatar className='size-9 after:border-0'>
                  <AvatarFallback
                    className={cn('bg-primary/10 text-primary shrink-0 [&>svg]:size-4.5', product.iconClassName)}
                  >
                    {product.icon}
                  </AvatarFallback>
                </Avatar>
                <div className='flex flex-col'>
                  <span className='text-base'>{product.productName}</span>
                  <span className='text-muted-foreground text-sm'>{product.productBrand}</span>
                </div>
              </div>
              <div className='flex items-center justify-between gap-3 text-sm'>
                <span className='text-sm'>{product.volume}</span>
                <Badge className='bg-primary/10 dark:bg-primary/25 text-primary h-6 px-3 py-1'>
                  {product.changePercentage > 0 && '+'}
                  {product.changePercentage}%
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </div>
    </Card>
  )
}

export default TopProductsCard
