'use client'

// Plan Finora P0 (E2): nagłówek z `src/components/layout/Header.tsx` szablonu.
// Kolejność: zwijanie paska · tytuł strony · ⌘K | przełącznik firmy · motyw ·
// avatar. Bez dzwonka (nie mamy listy powiadomień), bez ikony ustawień
// (są w pasku i w menu avatara) i bez panelu personalizacji.

// React Imports
import type { ReactNode } from 'react'

// Component Imports
import { BrandWordmark } from '@/components/brand/brand-wordmark'
import { CommandMenu } from '@/components/dashboard/command-menu'
import { ProfileMenu } from '@/components/dashboard/profile-menu'
import { ThemeToggle } from '@/components/dashboard/theme-toggle'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

export interface AppHeaderUser {
  email: string
  name?: string
}

/**
 * Nagłówek panelu. Przełącznik firmy i tytuł strony przychodzą jako sloty
 * (`ReactNode`), bo `DashboardOrgHeader` jest asynchronicznym Server
 * Componentem w `Suspense`, a komponent kliencki nie może go zaimportować.
 *
 * Klasa `ff-shell-header` niesie wysokość (`--ff-header-h` + wcięcie ekranu),
 * tło i dolną ramkę — zob. `app/globals.css`.
 */
export function AppHeader({
  orgSwitcher,
  pageHeading,
  user
}: {
  orgSwitcher: ReactNode
  pageHeading: ReactNode
  user: AppHeaderUser | null
}) {
  return (
    <header className='ff-shell-header sticky top-0 z-40 flex w-full shrink-0 items-center justify-between gap-3 px-4 sm:px-[var(--ff-container-padding)]'>
      {/* PODZIAŁ SZEROKOŚCI. Na telefonie lewa strona ma stałą szerokość
          wordmarku i lupy (`shrink-0`), a kurczy się prawa — inaczej długa
          nazwa organizacji („ORANGE POLSKA SPÓŁKA AKCYJNA") zjada cały pasek
          i z „FaktWay" zostaje samo „F". Od `lg` odwrotnie: rośnie lewa,
          bo to ona niesie tytuł strony i paletę poleceń. */}
      <div className='flex shrink-0 items-center gap-1.5 sm:gap-3 lg:min-w-0 lg:flex-1'>
        <SidebarTrigger className='[&_svg]:size-5!' />
        <Separator orientation='vertical' className='hidden h-4! self-center! lg:block' />
        {/* Na telefonie pasek nosi wordmark: pasek boczny z marką jest
            schowany, a gdzie jesteśmy, mówi dolna nawigacja. Ukrycie na
            opakowaniu, nie przez `className` wordmarku — ten prop trafia do
            wewnętrznego `<span>`, więc pusty odsyłacz zostałby w kolejności
            tabulacji. */}
        <div className='shrink-0 lg:hidden'>
          <BrandWordmark href='/dashboard' variant='app' className='text-[19px]' />
        </div>
        <div className='hidden min-w-0 lg:block'>{pageHeading}</div>
        <CommandMenu />
      </div>
      <div className='flex min-w-0 flex-1 items-center justify-end gap-2 lg:flex-none lg:shrink-0'>
        {orgSwitcher}
        <ThemeToggle />
        {/* Na telefonie Ustawienia i Wyloguj są w arkuszu „Więcej" dolnej
            nawigacji (plan Finora §4) — drugi zestaw w nagłówku byłby dublem,
            a pasek 375 px dzieli się już między wordmark, lupę, firmę i motyw. */}
        {user ? (
          <div className='hidden lg:flex'>
            <ProfileMenu email={user.email} name={user.name} />
          </div>
        ) : null}
      </div>
    </header>
  )
}
