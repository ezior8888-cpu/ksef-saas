import type { Metadata } from 'next';
import Link from 'next/link';

import { DrawnVideo } from '@/components/ui/drawn-video';

import { asset } from '../_assets';
import { Rise, SlideX } from '../_components/anim';
import { SiteFooter } from '../_components/closing';
import { IconSprite } from '../_components/icon-sprite';
import { MaskReveal, MaskRevealWords } from '../_components/mask-reveal';
import { SiteNav } from '../_components/site-nav';
import { SUPPORT_EMAIL } from '@/lib/site';

import { Container } from '../_components/ui';

export const metadata: Metadata = {
  title: 'O nas | FaktFlow',
  description:
    'Kto stoi za FaktFlow, w co wierzymy i dla kogo robimy program do faktur w KSeF.',
};

/**
 * Strona O nas odtworzona z pomiarów oryginału:
 *
 *   Nagłówek   1440×1403, odstęp od góry 160, kolumna 752 z filmem 400×252
 *   Galeria    pas na całą szerokość, cztery kadry 400×400, przerwa 12
 *   Metryki    biała karta 1140×204, promień 16, padding 24
 *   Wartości   dwie kolumny: 467 (cytat) obok 559 (cztery karty, przerwa 16)
 *   Zespół     siatka 1140 z czterema kartami 276×402
 *   Rekrutacja biała karta 946×246, film 250×150 obok tekstu, przerwa 64
 *   Zamknięcie jasne, z pulpitem w ramce 1016 na tle gradientu
 */
const VALUES = [
  {
    title: 'Jasne zasady',
    body: 'Mówimy wprost, ile co kosztuje i co dzieje się z danymi. Bez gwiazdek i drobnego druku.',
  },
  {
    title: 'Niezawodność',
    body: 'Faktura musi wyjść wtedy, kiedy jej potrzebujesz. Dlatego pilnujemy wysyłki nawet, gdy KSeF ma gorszy dzień.',
  },
  {
    title: 'Prostota',
    body: 'Zamieniamy urzędowe formularze w kilka pól do wypełnienia. Resztę robimy w tle.',
  },
  {
    title: 'Blisko użytkownika',
    body: 'Czytamy każdą wiadomość i poprawiamy to, co realnie przeszkadza w pracy.',
  },
];

export default function AboutPage() {
  return (
    <>
      <IconSprite />
      <SiteNav />

      {/* ── nagłówek, galeria, liczby ──────────────────────────────── */}
      <header className="flex flex-col gap-16 pb-20 pt-[128px]">
        <Container>
          <div className="flex max-w-[752px] flex-col gap-10">
            <h1 className="z-h1">
              <MaskRevealWords text="Robimy program do faktur, którego sami chcieliśmy używać" />
            </h1>
            <Rise delay={0.2}>
              <DrawnVideo
            src={asset.about.hero}
            width={400}
            height={252}
            className="h-auto w-[400px] max-w-full"
          />
            </Rise>
          </div>
        </Container>

        {/* Pas „Zespół przy pracy” usunięty 15.10.2026: zdjęcia obcych osób
            z szablonu podpisane jako nasz zespół (wprowadzanie w błąd,
            a wizerunek modeli użyty w cudzym kontekście). */}

        {/* Metryki („1,2 mln faktur przeszło przez FaktFlow”, „8 tys. firm
            miesięcznie”, „99,9% dostępności”) usunięte 15.10.2026: liczby
            pochodziły z szablonu, a serwis jest przed startem. Wracają tylko
            z danymi, które da się wykazać (art. 5 u.p.n.p.r., art. 16 u.z.n.k.). */}
      </header>

      {/* ── wartości: 467 obok 559 ─────────────────────────────────── */}
      <section className="py-20">
        <Container className="flex flex-col gap-12 lg:flex-row lg:justify-between">
          <div className="flex flex-col gap-10 lg:w-[467px] lg:shrink-0">
            <h2 className="z-h2">
              <MaskRevealWords text="W co wierzymy" />
            </h2>
            <MaskReveal delay={0.15}>
              <p className="z-h4 font-normal">
                Faktury to obowiązek, nie zajęcie. Chcemy, żeby zajmowały kilka
                minut dziennie, a nie cały wieczór na koniec miesiąca.
              </p>
            </MaskReveal>
            <Rise delay={0.25}>
              <div className="flex items-center gap-4">
                {/* Inicjały zamiast portretu: zdjęcie było portretem obcej
                    osoby z szablonu podpisanym nazwiskiem założyciela. */}
                <span
                  aria-hidden
                  className="z-lead flex size-14 items-center justify-center rounded-full bg-[var(--z-blue-50)] font-medium text-[var(--z-blue)]"
                >
                  BG
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="z-lead font-medium">
                    Bartosz Gierszewski
                  </span>
                  <span className="z-body text-[var(--z-muted)]">
                    Założyciel FaktFlow
                  </span>
                </div>
              </div>
            </Rise>
          </div>

          {/* cztery karty jedna pod drugą, wjeżdżają z prawej */}
          <div className="flex flex-col gap-4 lg:w-[559px] lg:shrink-0">
            {VALUES.map((v, i) => (
              <SlideX key={v.title} from="right" delay={i * 0.08}>
                <div className="flex flex-col gap-2 rounded-[16px] bg-[var(--z-50)] p-6 transition-colors duration-300 hover:bg-[var(--z-100)]">
                  <h3 className="z-lead font-medium">{v.title}</h3>
                  <p className="z-body text-[var(--z-muted)]">{v.body}</p>
                </div>
              </SlideX>
            ))}
          </div>
        </Container>
      </section>

      {/* ── zespół + rekrutacja ────────────────────────────────────── */}
      <section className="py-20">
        <Container className="flex flex-col gap-16">
          <div className="flex max-w-[550px] flex-col gap-5">
            <h2 className="z-h2 w-full">
              <MaskRevealWords text="Ludzie za FaktFlow" />
            </h2>
            <MaskReveal delay={0.15}>
              <p className="z-lead text-[var(--z-muted)]">
                Mały zespół, który zna KSeF od podszewki i sam prowadzi firmę.
              </p>
            </MaskReveal>
          </div>

          {/* Siatka zespołu usunięta 15.10.2026: trzy z czterech osób
              (z portretami z szablonu) nie istniały. Wraca z prawdziwymi
              osobami, ich zdjęciami i zgodą na publikację wizerunku. */}

          {/* biała karta 946×246: film 250×150 obok tekstu, przerwa 64 */}
          <Rise>
            <div className="mx-auto flex w-full max-w-[946px] flex-col items-center gap-8 rounded-[20px] bg-white p-8 shadow-[0_16px_40px_-24px_rgba(16,32,64,0.25)] lg:flex-row lg:gap-16 lg:px-8 lg:py-12">
              <DrawnVideo
            src={asset.about.career}
            width={250}
            height={150}
            className="h-auto w-[250px] shrink-0"
          />
              <div className="flex flex-col gap-6 lg:w-[500px]">
                <div className="flex flex-col gap-3">
                  <h3 className="z-h4">Dołącz do nas</h3>
                  <p className="z-body text-[var(--z-muted)]">
                    Lubisz upraszczać skomplikowane rzeczy? Napisz do nas —
                    nie prowadzimy teraz rekrutacji, ale chętnie poznamy
                    ludzi, którzy chcą współtworzyć FaktFlow.
                  </p>
                </div>
                {/* Dawniej „Zobacz oferty na LinkedIn” → linkedin.com (strona
                    główna, żadnych ofert). */}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="z-body inline-flex w-fit items-center rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
                >
                  Napisz: {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </Rise>
        </Container>
      </section>

      {/* ── zamknięcie: jasne, z pulpitem w ramce ───────────────────── */}
      <section className="relative py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-5 inset-y-0 rounded-[40px]"
          style={{
            background:
              'linear-gradient(180deg, #fff 0%, #eff5fe 55%, #dbe8fb 100%)',
          }}
        />
        <Container className="relative flex flex-col items-center gap-16">
          <div className="flex max-w-[550px] flex-col items-center gap-6 text-center">
            <h2 className="z-h2 w-full">
              <MaskRevealWords text="Wystaw pierwszą fakturę jeszcze dziś" />
            </h2>
            <MaskReveal delay={0.15}>
              {/* Dawniej „bez podawania karty” — kartę podaje się przy
                  uruchomieniu subskrypcji (regulamin § 6 ust. 3). */}
              <p className="z-lead text-[var(--z-muted)]">
                Konto jest bezpłatne, a subskrypcja zaczyna się od 30 dni bez
                opłat. Zrezygnujesz przed ich końcem — nie zapłacisz nic.
              </p>
            </MaskReveal>
            <Rise delay={0.25}>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/register"
                  className="z-body inline-flex items-center rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
                >
                  Zacznij za darmo
                </Link>
                <Link
                  href="/#pricing"
                  className="z-body inline-flex items-center rounded-[12px] border border-[var(--z-300)] bg-white px-5 py-3.5 font-medium text-[var(--z-black)] transition-colors hover:bg-[var(--z-50)]"
                >
                  Zobacz cennik
                </Link>
              </div>
            </Rise>
          </div>

          {/* „Pulpit FaktFlow” usunięty 15.10.2026 — był to panel
              inwestycyjny z szablonu. Wraca tylko prawdziwy zrzut. */}
        </Container>
      </section>

      <SiteFooter />
    </>
  );
}
