// Plan Finora P15 (E10b): układ `src/views/pages/auth/{login,register,
// forgot-password}/index.tsx` szablonu — formularz po lewej, po prawej karta
// z animowanym tłem ze znaków, nagłówkiem i białą „kartą z wycięciem”.
// Siatka, odstępy i rozmiary 1:1. Zmiany (plan §5 P15):
//  - korzeń ma `min-h-dvh` zamiast `h-dvh`, a prawa karta `lg:sticky lg:h-dvh`:
//    nasze formularze mają komunikaty, Turnstile i dłuższe kreatory
//    (onboarding), a przy `h-dvh` + `items-center` górę zbyt wysokiej treści
//    ucina ekran bez przewijania;
//  - prawa połowa jak w Finorze: czerń (#000000), biała karta z wycięciem
//    i biały/czarny tekst na sztywno w OBU motywach (kontrast ≥ 4,5:1);
//  - w białej karcie zamiast znaku i tekstu Finory nasz znak i hasło FaktWay;
//  - poniżej `lg` prawa połowa jest ukryta (jak w Finorze), więc hasło stoi
//    nad formularzem w jednym akapicie.
// Klasa `ff-dashboard` daje skalę SM presetu D2 i font panelu (§10.1) —
// tak jak w Finorze, gdzie skala siedzi na <html> także dla ekranów auth.

// React Imports
import type { ReactNode } from 'react'

// Next Imports
import Image from 'next/image'
import Link from 'next/link'

// Component Imports
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PortalContainerProvider } from '@/components/ui/portal-container'

import { AuthGlitchBackground } from './auth-glitch-background'
import { AuthLogo } from './auth-logo'

/** Hasło z planu §5 P15 (treść do akceptacji Masła). */
export const AUTH_SLOGAN_TITLE = 'Faktury w KSeF bez stresu.'
export const AUTH_SLOGAN_TEXT = 'FLO pilnuje terminów, płatności i VAT‑u za Ciebie.'

export function AuthSplitLayout({
  children,
  panelTitle,
  panelText
}: {
  children: ReactNode
  /** Duży nagłówek na animowanym tle (Finora: „Welcome back!”). */
  panelTitle: string
  /** Akapit pod nagłówkiem. */
  panelText: string
}) {
  return (
    <div className='ff-dashboard min-h-dvh text-foreground'>
      {/* Okna i menu (np. import z pliku w onboardingu) renderują się w tym
          drzewie, więc dziedziczą skalę i motyw `.ff-dashboard` — jak w panelu. */}
      <PortalContainerProvider>
        <div className='min-h-dvh lg:grid lg:grid-cols-2'>
          <div className='flex min-h-dvh items-center justify-center space-y-6 sm:px-6 md:px-8'>
            <div className='flex w-full flex-col gap-6 p-6 sm:max-w-lg'>
              <Link href='/' className='w-fit'>
                <AuthLogo className='gap-3' />
              </Link>

              <p className='text-muted-foreground lg:hidden'>
                {AUTH_SLOGAN_TITLE} {AUTH_SLOGAN_TEXT}
              </p>

              {children}
            </div>
          </div>

          <Card className='relative h-full justify-between overflow-hidden border-none py-8 max-lg:hidden lg:sticky lg:top-0 lg:h-dvh'>
            <div className='pointer-events-none absolute inset-0 z-0'>
              <AuthGlitchBackground />
            </div>

            <div className='pointer-events-none absolute inset-0 z-1' />

            <CardHeader className='relative z-10 gap-6 px-8'>
              <CardTitle className='text-4xl font-bold text-white xl:text-5xl/15.5'>{panelTitle}</CardTitle>
              <p className='text-xl text-white'>{panelText}</p>
            </CardHeader>

            <CardContent className='relative z-10 mx-8 h-62 overflow-hidden rounded-2xl px-0'>
              <svg
                width='1094'
                height='249'
                viewBox='0 0 1094 249'
                fill='none'
                xmlns='http://www.w3.org/2000/svg'
                className='pointer-events-none absolute right-0 -z-1 select-none'
                aria-hidden
              >
                <path
                  d='M0.263672 16.8809C0.263672 8.0443 7.42712 0.880859 16.2637 0.880859H786.394H999.115C1012.37 0.880859 1023.12 11.626 1023.12 24.8808L1023.12 47.3809C1023.12 60.6357 1033.86 71.3809 1047.12 71.3809H1069.6C1082.85 71.3809 1093.6 82.126 1093.6 95.3809L1093.6 232.881C1093.6 241.717 1086.43 248.881 1077.6 248.881H16.2637C7.42716 248.881 0.263672 241.717 0.263672 232.881V16.8809Z'
                  fill='#ffff'
                  fillOpacity={0.8}
                />
              </svg>

              <div className='absolute top-0 right-0 flex size-15 items-center justify-center rounded-2xl bg-[#F5F5F5]/80'>
                <Image
                  src='/brand/faktflow-mark.png'
                  alt=''
                  width={128}
                  height={128}
                  className='size-10 rounded-lg object-contain'
                  unoptimized
                />
              </div>

              <div className='flex flex-col gap-4 p-6 text-black'>
                <p className='line-clamp-2 pr-12 text-3xl font-bold'>{AUTH_SLOGAN_TITLE}</p>
                <p className='line-clamp-3 text-lg leading-snug'>{AUTH_SLOGAN_TEXT}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </PortalContainerProvider>
    </div>
  )
}
