import { Sparkles } from 'lucide-react';

import { PRICE_PER_MONTH, TRIAL_DAYS } from '@/lib/billing/pricing';

import { ButtonLink, Container } from './ui';

/**
 * Podkreślenie słowa w nagłówku: jedna linia „markerem”, rysowana tutaj.
 * `preserveAspectRatio="none"` rozciąga ją pod słowo o dowolnej długości.
 */
function MarkerStroke({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 300 24" preserveAspectRatio="none" fill="none" className={className}>
      <path
        d="M6 15 C 64 7, 132 5, 196 9 S 280 14, 294 11"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Hero() {
  return (
    <Container className="pt-14 pb-20 text-center sm:pt-20 lg:pt-28 lg:pb-28">
      <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
        <Sparkles aria-hidden className="size-4" />
        Wkrótce: agent FLO
      </p>

      <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-balance text-foreground sm:text-7xl">
        Twój{' '}
        <span className="relative whitespace-nowrap text-primary">
          <MarkerStroke className="absolute -bottom-[0.06em] left-[-3%] h-[0.42em] w-[106%] text-primary/20" />
          <span className="relative">agent AI</span>
        </span>{' '}
        od faktur
      </h1>

      <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
        FLO będzie pilnował płatności, poprawiał faktury odrzucone przez KSeF i szykował paczkę
        dla księgowej. Ciebie zapyta tylko o decyzję.
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/register">Wypróbuj za darmo</ButtonLink>
        <ButtonLink href="#flo" variant="outline">
          Zobacz, jak działa FLO
        </ButtonLink>
      </div>

      <p className="mx-auto mt-8 max-w-xl text-sm text-pretty text-muted-foreground">
        FLO jest w przygotowaniu. Już dziś wystawisz w FaktWay faktury i wyślesz je do KSeF:{' '}
        {TRIAL_DAYS} dni za darmo, potem {PRICE_PER_MONTH}.
      </p>
    </Container>
  );
}
