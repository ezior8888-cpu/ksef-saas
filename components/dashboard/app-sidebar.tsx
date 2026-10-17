'use client'

// Plan Finora §4/P0 (E2): pasek boczny z `src/components/layout/Sidebar.tsx`
// szablonu. Stałe z D2: wariant `inset`, zwijanie do ikon. Pozycje menu
// z `lib/dashboard-nav-config.ts` (bez `Collapsible` — nasze menu jest płaskie).

// React Imports
import { memo, useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'

// Next Imports
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

// Component Imports
import { BrandWordmark } from '@/components/brand/brand-wordmark'
import { FaktflowMark } from '@/components/brand/faktflow-mark'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'

// Config Imports
import {
  dashboardNavSections,
  dashboardSettingsNavItem,
  isActiveNavPath,
  type DashboardNavItem
} from '@/lib/dashboard-nav-config'

const SIDEBAR_VARIANT = 'inset'
const SIDEBAR_COLLAPSIBLE = 'icon'

/** Klasy aktywnej pozycji jak w Finorze (pigułka w kolorze `primary`). */
const ACTIVE_ITEM_CLASS =
  'data-active:bg-primary/10! dark:data-active:bg-primary/20! data-active:text-primary hover:data-active:text-primary'

function shouldHandlePrimaryInAppNav(e: ReactPointerEvent): boolean {
  return e.pointerType !== 'mouse' || (e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey)
}

interface NavItemProps {
  item: DashboardNavItem
  active: boolean
  onPrimaryDown: (href: string) => void
  onPrefetchHover: (href: string) => void
}

/**
 * Pojedyncza pozycja menu — `memo` po stricte równych propsach. Zmiana
 * `pendingHref` w rodzicu przerysowuje wyłącznie dwie pozycje (poprzednią
 * aktywną i nową), a nie całe menu.
 */
const NavItem = memo(function NavItem({ item, active, onPrimaryDown, onPrefetchHover }: NavItemProps) {
  const Icon = item.icon
  const prefetchable = item.prefetch !== false

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.label}
        isActive={active}
        className={ACTIVE_ITEM_CLASS}
        render={<Link href={item.href} prefetch={prefetchable ? undefined : false} />}
        onPointerDown={e => {
          if (!shouldHandlePrimaryInAppNav(e)) return
          onPrimaryDown(item.href)
        }}
        onPointerEnter={prefetchable ? () => onPrefetchHover(item.href) : undefined}
        onFocus={prefetchable ? () => onPrefetchHover(item.href) : undefined}
      >
        <Icon aria-hidden />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
})

/** Kliknięty cel i adres, z którego go kliknięto. */
interface PendingNav {
  href: string
  fromPath: string
}

/**
 * Podświetlenie menu odłączone od momentu, w którym Next dokończy RSC:
 * `pointerdown` ustawia „cel” natychmiast, a kolejne szybkie kliknięcia go
 * nadpisują. Cel świeci tylko, dopóki adres się nie zmieni — każda zmiana
 * adresu (dotarcie do celu albo przekierowanie gdzie indziej) go unieważnia,
 * bez efektu zerującego stan.
 */
export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, setPending] = useState<PendingNav | null>(null)

  const beginNavTo = useCallback(
    (href: string) => {
      setPending(isActiveNavPath(pathname, href) ? null : { href, fromPath: pathname })
    },
    [pathname]
  )

  const armPrefetch = useCallback(
    (href: string) => {
      void router.prefetch(href)
    },
    [router]
  )

  /** Obecnie podświetlana trasa: pending wygrywa, dopóki URL nie dogoni. */
  const highlightedHref = useMemo(() => {
    if (pending !== null && pending.fromPath === pathname && !isActiveNavPath(pathname, pending.href)) {
      return pending.href
    }

    return null
  }, [pathname, pending])

  const isHrefActive = useCallback(
    (href: string) => {
      if (highlightedHref !== null) return href === highlightedHref

      return isActiveNavPath(pathname, href)
    },
    [pathname, highlightedHref]
  )

  return (
    <Sidebar variant={SIDEBAR_VARIANT} collapsible={SIDEBAR_COLLAPSIBLE}>
      <SidebarHeader className='h-(--ff-header-h) flex-row items-center px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0'>
        {/* Rozwinięty: wordmark. Zwinięty do ikon: sam znak (wordmark nie
            mieści się w 3rem). */}
        <div className='min-w-0 group-data-[collapsible=icon]:hidden'>
          <BrandWordmark href='/dashboard' variant='app' className='text-[19px]' />
        </div>
        <Link
          href='/dashboard'
          className='hidden shrink-0 transition-opacity group-data-[collapsible=icon]:flex hover:opacity-80 [&_img]:size-8 [&_img]:rounded-lg'
        >
          <FaktflowMark variant='header' priority={false} />
        </Link>
      </SidebarHeader>

      <SidebarContent className='group-data-[collapsible=icon]:overflow-y-auto'>
        {dashboardNavSections.map(section => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel className='text-sidebar-foreground/50 tracking-wider uppercase'>
              {section.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className='gap-0.5'>
                {section.items.map(item => (
                  <NavItem
                    key={item.href}
                    item={item}
                    active={isHrefActive(item.href)}
                    onPrimaryDown={beginNavTo}
                    onPrefetchHover={armPrefetch}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <NavItem
            item={dashboardSettingsNavItem}
            active={isHrefActive(dashboardSettingsNavItem.href)}
            onPrimaryDown={beginNavTo}
            onPrefetchHover={armPrefetch}
          />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
