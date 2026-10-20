'use client'

// Port z szablonu Finora (src/views/settings/settings-nav.tsx). Różnice:
// pozycje to <Link> do `/settings/*` (aktywna według `usePathname()`), a nie
// przyciski przełączające stan; link ostylowany `buttonVariants` jak w Finorze
// (`privacy/data-info-card.tsx`), bo Base UI Button z `nativeButton={false}`
// dokłada role="button" i czytnik ekranu czytałby zakładki jak przyciski
// (ta sama decyzja co w `components/ui/pagination.tsx`). Bez odznaki „Soon” —
// nie mamy zakładek „wkrótce”.

// Next Imports
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Component Imports
import { buttonVariants } from '@/components/ui/button'

// Util Imports
import { cn } from '@/lib/utils'
import { isSettingsTabActive, type SettingsTab } from './settings-tabs'

type SettingsNavProps = {
  tabs: SettingsTab[]
  onSelect?: () => void
}

const SettingsNav = ({ tabs, onSelect }: SettingsNavProps) => {
  const pathname = usePathname() ?? ''

  return (
    <nav aria-label='Ustawienia' className='flex flex-col gap-0.5 p-2'>
      {tabs.map(item => {
        const active = isSettingsTabActive(pathname, item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onSelect}
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              'justify-between',
              active &&
                'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary dark:hover:bg-primary/30 dark:bg-primary/20'
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default SettingsNav
