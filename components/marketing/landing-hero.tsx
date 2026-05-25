import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/** Hero głównej strony — układ jak Fakturownia: tekst + zdjęcie. */
export function LandingHero() {
  return (
    <section>
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-14 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-20">
        <div className="max-w-xl">
          <p className="marketing-hero-eyebrow">KSeF 2.0 · faktury i KPiR</p>
          <h1 className="marketing-hero-title mt-5 text-4xl sm:text-5xl lg:text-[3.25rem]">
            Wystawiaj faktury w&nbsp;KSeF jednym kliknięciem
          </h1>
          <p className="marketing-hero-body mt-6 max-w-lg">
            Zdjęcie paragonu trafia do&nbsp;KPiR. Wkurzacz Dłużników pilnuje płatności.
            Walidacja FA(3) przed wysyłką — bez stresu z&nbsp;urzędem skarbowym.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/register" className="marketing-cta-primary">
              Wypróbuj za darmo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/kalkulator-oszczednosci"
              className="text-[15px] font-semibold text-[var(--marketing-muted)] underline decoration-white/20 underline-offset-4 transition-colors hover:text-[var(--marketing-accent)] hover:decoration-[var(--marketing-accent)]"
            >
              Sprawdź oszczędności
            </Link>
          </div>
          <p className="mt-5 text-xs font-medium text-[color-mix(in_srgb,var(--marketing-muted)_75%,transparent)]">
            30 dni bez karty · migracja z Fakturowni / inFakt · dane w UE (Frankfurt)
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
          <div
            className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-emerald-500/20 via-transparent to-indigo-500/15"
            aria-hidden
          />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#1d1e27] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.55)]">
            <Image
              src="/marketing/hero.jpg"
              alt="Przedsiębiorca w biurze — faktury i rozliczenia w FaktFlow"
              width={1400}
              height={803}
              className="h-auto w-full object-cover opacity-95"
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
