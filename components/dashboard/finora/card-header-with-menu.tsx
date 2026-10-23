'use client'

// Third-party Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

/**
 * Pozycja menu ⋯ karty (PLAN-PRAWDZIWE-DANE E7 pkt 1): link albo akcja —
 * martwych pozycji („Udostępnij”, „Aktualizuj” z szablonu) typ nie
 * dopuszcza. Same napisy, więc karty serwerowe podają je bez zmian.
 */
export type CardMenuItem = { label: string; href: string } | { label: string; akcja: 'odswiez' }

// Bez eksportu stałych: karty serwerowe dostałyby z pliku `'use client'` referencję, nie obiekt.
const defaultMenuItems: CardMenuItem[] = [{ label: 'Odśwież', akcja: 'odswiez' }]

type CardHeaderWithMenuProps = {
  title: string
  subTitle?: string
  menuItems?: CardMenuItem[]
  className?: string
}

/** Osobny komponent: `useRouter` działa dopiero po otwarciu menu (treść menu montuje się przy otwarciu). */
const RefreshItem = ({ label }: { label: string }) => {
  const router = useRouter()

  return <DropdownMenuItem onClick={() => router.refresh()}>{label}</DropdownMenuItem>
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
            {menuItems.map((item, index) =>
              'href' in item ? (
                <DropdownMenuItem key={index} render={<Link href={item.href} />}>
                  {item.label}
                </DropdownMenuItem>
              ) : (
                <RefreshItem key={index} label={item.label} />
              )
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardHeader>
  )
}

export default CardHeaderWithMenu
