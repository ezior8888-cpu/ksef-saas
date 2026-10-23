import { PRICE_PER_MONTH, TRIAL_DAYS } from '@/lib/billing/pricing';
import { MarkerStroke } from '@/components/site/marker-stroke';
import { Reveal } from '@/components/site/motion';
import { ButtonLink, Container } from '@/components/site/ui';

// Hasło to samo co na ekranie logowania (AUTH_SLOGAN_TITLE). Wejście przy
// załadowaniu: nagłówek, opis, przyciski po kolei, potem rysuje się
// podkreślenie.
export function Hero() {
  return (
    <Container className="pt-16 pb-20 text-center sm:pt-24 lg:pt-32 lg:pb-28">
      <Reveal onLoad>
        <h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-tight text-balance text-foreground sm:text-7xl">
          {/* Twarda spacja: „w” nie może zostać samo na końcu linii. */}
          Faktury w{' '}KSeF{' '}
          <span className="relative whitespace-nowrap text-primary">
            <MarkerStroke className="absolute -bottom-[0.06em] left-[-3%] h-[0.42em] w-[106%] text-primary/20" />
            <span className="relative">bez stresu</span>
          </span>
        </h1>
      </Reveal>

      <Reveal onLoad delay={0.1}>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
          Wystawiasz fakturę, a FaktWay wysyła ją do KSeF, pilnuje potwierdzenia i płatności.
          Resztę przygotowuje FLO, nasz agent AI.
        </p>
      </Reveal>

      <Reveal onLoad delay={0.2} className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/register">Wypróbuj za darmo</ButtonLink>
        <ButtonLink href="#funkcje" variant="outline">
          Zobacz, jak to działa
        </ButtonLink>
      </Reveal>

      <Reveal onLoad delay={0.3}>
        <p className="mt-6 text-sm text-muted-foreground">
          {TRIAL_DAYS} dni za darmo, potem {PRICE_PER_MONTH}. Rezygnujesz, kiedy chcesz.
        </p>
      </Reveal>
    </Container>
  );
}
