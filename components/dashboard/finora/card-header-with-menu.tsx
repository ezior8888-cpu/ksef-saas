// Third-party Imports
import { RiMore2Line } from '@remixicon/react'

// Component Imports
import { Button } from '@/components/ui/button'
import { CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

const defaultMenuItems = ['Udostępnij', 'Aktualizuj', 'Odśwież']

type CardHeaderWithMenuProps = {
  title: string
  subTitle?: string
  menuItems?: string[]
  className?: string
}

const CardHeaderWithMenu = ({ title, subTitle, menuItems = defaultMenuItems, className }: CardHeaderWithMenuProps) => {
  return (
    <CardHeader className={className ?? 'flex items-center justify-between'}>
      <div className='flex flex-col gap-1'>
        <span className='text-lg font-semibold'>{title}</span>
        {subTitle && <span className='text-muted-foreground text-sm'>{subTitle}</span>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant='ghost' size='icon' className='text-muted-foreground size-6 rounded-full' />}
        >
          <RiMore2Line />
          <span className='sr-only'>Menu</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuGroup>
            {menuItems.map((item, index) => (
              <DropdownMenuItem key={index}>{item}</DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardHeader>
  )
}

export default CardHeaderWithMenu
