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

// Hasło to samo co na ekranie logowania (AUTH_SLOGAN_TITLE).
export function Hero() {
  return (
    <Container className="pt-16 pb-20 text-center sm:pt-24 lg:pt-32 lg:pb-28">
      <h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-tight text-balance text-foreground sm:text-7xl">
        {/* Twarda spacja: „w” nie może zostać samo na końcu linii. */}
        Faktury w{' '}KSeF{' '}
        <span className="relative whitespace-nowrap text-primary">
          <MarkerStroke className="absolute -bottom-[0.06em] left-[-3%] h-[0.42em] w-[106%] text-primary/20" />
          <span className="relative">bez stresu</span>
        </span>
      </h1>

      <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
        Wystawiasz fakturę, a FaktWay wysyła ją do KSeF, pilnuje potwierdzenia i płatności.
        Resztę przygotowuje FLO, nasz agent AI.
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/register">Wypróbuj za darmo</ButtonLink>
        <ButtonLink href="#funkcje" variant="outline">
          Zobacz, jak to działa
        </ButtonLink>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        {TRIAL_DAYS} dni za darmo, potem {PRICE_PER_MONTH}. Rezygnujesz, kiedy chcesz.
      </p>
    </Container>
  );
}
