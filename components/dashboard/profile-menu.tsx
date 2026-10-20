'use client'

// Plan Finora P0 (E2): wygląd `ProfileDropdown` z szablonu, pozycje tylko
// z P0 — Ustawienia, Przełącz firmę, Wyloguj. Bez zdjęcia i kropki statusu.

// Next Imports
import Link from 'next/link'

// React Imports
import { useFormStatus } from 'react-dom'

// Third-party Imports
import { RiArrowLeftRightLine, RiLogoutBoxLine, RiSettings3Line } from '@remixicon/react'

// Component Imports
import { signOut } from '@/app/(auth)/login/actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

// Lib Imports
import { OTWORZ_PRZELACZNIK_FIRMY } from '@/lib/org-switcher-event'

/**
 * Inicjały z adresu e-mail: „jan.kowalski@…” → „JK”, „anna@…” → „AN”.
 * Pusty albo dziwny adres daje „?”, żeby kółko nigdy nie było puste.
 */
export function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._\-+]+/).filter(part => /[\p{L}\p{N}]/u.test(part))

  if (parts.length >= 2) {
    return (firstLetter(parts[0]) + firstLetter(parts[1])).toUpperCase()
  }

  const letters = [...(parts[0] ?? '')].filter(ch => /[\p{L}\p{N}]/u.test(ch))

  if (letters.length === 0) return '?'

  return letters.slice(0, 2).join('').toUpperCase()
}

function firstLetter(part: string): string {
  return [...part].find(ch => /[\p{L}\p{N}]/u.test(ch)) ?? ''
}

/**
 * Pozycja „Wyloguj” jako przycisk wysyłający formularz z akcją `signOut`
 * (ta sama droga co arkusz „Więcej” w `bottom-nav.tsx`). `closeOnClick={false}`:
 * menu zostaje otwarte do przekierowania na `/login`, bo zamknięcie zdjęłoby
 * formularz z drzewa w trakcie wysyłki.
 */
function SignOutItem() {
  const { pending } = useFormStatus()

  return (
    <DropdownMenuItem
      variant='destructive'
      closeOnClick={false}
      disabled={pending}
      nativeButton
      render={<button type='submit' className='w-full' />}
    >
      <RiLogoutBoxLine aria-hidden />
      <span>{pending ? 'Wylogowuję…' : 'Wyloguj'}</span>
    </DropdownMenuItem>
  )
}

export function ProfileMenu({ email, name }: { email: string; name?: string }) {
  const initials = initialsFromEmail(email)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant='ghost'
            size='icon'
            className='relative rounded-full hover:bg-transparent'
            aria-label='Menu konta'
          />
        }
      >
        <Avatar>
          <AvatarFallback className='bg-primary/10 text-accent-foreground font-medium'>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-65'>
        <DropdownMenuGroup>
          <DropdownMenuLabel className='flex items-center gap-3 px-2 py-2.5 font-normal'>
            <Avatar className='size-10'>
              <AvatarFallback className='bg-primary/10 text-accent-foreground font-medium'>{initials}</AvatarFallback>
            </Avatar>
            <div className='flex min-w-0 flex-1 flex-col items-start'>
              {name ? (
                <span className='text-foreground w-full truncate text-sm font-semibold'>{name}</span>
              ) : (
                <span className='text-muted-foreground text-xs'>Zalogowano jako</span>
              )}
              <span className={name ? 'text-muted-foreground w-full truncate text-xs' : 'text-foreground w-full truncate text-sm font-medium'}>
                {email}
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup className='p-1'>
          <DropdownMenuItem render={<Link href='/settings' />}>
            <RiSettings3Line aria-hidden />
            <span>Ustawienia</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.dispatchEvent(new Event(OTWORZ_PRZELACZNIK_FIRMY))}>
            <RiArrowLeftRightLine aria-hidden />
            <span>Przełącz firmę</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <form action={signOut}>
          <DropdownMenuGroup className='p-1'>
            <SignOutItem />
          </DropdownMenuGroup>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
