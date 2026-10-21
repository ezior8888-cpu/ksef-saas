'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

import { MaskReveal, MaskRevealWords } from './mask-reveal';
import { Container, Icon } from './ui';

/**
 * Układ i animacje odtworzone z pomiarów oryginału:
 *
 *   Wrap 1140 = Header 376 (nagłówek + menu) | Main 661
 *   Main to KARTA #fafafa, promień 20, padding 40 — nie goła kolumna.
 *   Pozycje menu: 376×64, tło #fafafa, promień 8, padding 20, odstęp 12.
 *   Blok „Benefit”: 581×456, odstęp 64.
 *
 * Aktywna pozycja podąża za przewijaniem (scroll-spy): podświetla się ta,
 * której blok jest aktualnie w kadrze. Ikona zmienia barwę przez podmianę
 * zmiennej `--21h8s6`, której sprite używa jako koloru kreski — w oryginale
 * to dwa nałożone SVG przenikające się przezroczystością.
 */
// Bez obrazków od 15.10.2026: „zrzuty” z szablonu pokazywały panel
// inwestycyjny „Zova AI” (Apple Store, $150,000), nie FaktWay — klient
// oglądał produkt, którego nie kupuje. Wracają tylko prawdziwe zrzuty.
// Blok 3 obiecywał „dziesięć lat” przechowywania — regulamin i umowa
// powierzenia mówią o czasie trwania umowy (§ 7 ust. 6, umowa powierzenia § 9).
const BLOCKS = [
  {
    icon: '450316432',
    title: 'Wysyłka bez niespodzianek',
    body: 'Faktura trafia do KSeF zaraz po wystawieniu, a Ty widzisz jej status i numer KSeF. Gdy system ministerstwa nie odpowiada, ponawiamy wysyłkę i informujemy Cię o wyniku.',
  },
  {
    icon: '1283949305',
    title: 'Koszty bez przepisywania',
    body: 'Ze zdjęcia paragonu albo faktury z maila przygotowujemy wpis do książki przychodów i rozchodów — Ty go sprawdzasz i zatwierdzasz.',
  },
  {
    icon: '1430394497',
    title: 'Porządek przy kontroli',
    body: 'Dokumenty są w jednym miejscu przez cały czas korzystania z FaktWay, a dziennik zdarzeń pokazuje, kto i kiedy co zrobił. Eksport danych w każdej chwili.',
  },
];

export function WhyUs() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    // Bloki czytamy wprost z dokumentu, nie z tablicy referencji: przy
    // przerysowaniu React czyści wywołanie zwrotne przed ponownym ustawieniem
    // i tablica bywa chwilowo pusta, a wtedy przeliczenie nie ma czego mierzyć.
    const bloki = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[id^="benefit-"]'));

    // O aktywnej pozycji decyduje GEOMETRIA, nie współczynnik widoczności.
    // Wybieramy blok, którego góra jest najbliżej linii czytania (40% okna);
    // bloki jeszcze poniżej niej są karane trzykrotnie, żeby podświetlenie
    // nie wybiegało w przód.
    const recompute = () => {
      const line = window.innerHeight * 0.4;
      let best = 0;
      let bestDist = Infinity;

      bloki().forEach((el, i) => {
        const { top } = el.getBoundingClientRect();
        const dist = top <= line ? line - top : (top - line) * 3;
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });

      setActive((prev) => (prev === best ? prev : best));
    };

    const io = new IntersectionObserver(recompute, {
      threshold: [0, 0.05, 0.2, 0.4, 0.6, 0.8, 1],
    });
    bloki().forEach((el) => io.observe(el));

    recompute();
    window.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute, { passive: true });

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
    };
  }, []);

  return (
    <section id="why-us" className="py-20 lg:py-20">
      <Container className="flex flex-col gap-12 lg:flex-row lg:gap-[103px]">
        {/* kolumna nagłówka — 376 px */}
        <div className="flex flex-col gap-10 lg:w-[376px] lg:shrink-0 lg:sticky lg:top-28 lg:self-start">
          <div className="flex flex-col gap-4">
            <h2 className="z-h2">
              <MaskRevealWords text="Dlaczego FaktWay" />
            </h2>
            <MaskReveal delay={0.18}>
              {/* Dawniej „mikrofirmy zostają z nami” (przed startem nie ma
                  kogo zatrzymać) i „sam pilnuje przepisów” — za treść faktur
                  odpowiada klient (regulamin § 7 ust. 2). */}
              <p className="z-lead text-[var(--z-muted)]">
                Prosty program do faktur, który pilnuje wysyłki do KSeF
                i przypomina o terminach.
              </p>
            </MaskReveal>
          </div>

          {/* menu 376×216: trzy karty 64 px z odstępem 12 */}
          <ul className="flex flex-col gap-3">
            {BLOCKS.map((b, i) => {
              const on = i === active;
              return (
                <motion.li
                  key={b.title}
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{
                    duration: 0.6,
                    delay: 0.1 + i * 0.09,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <a
                    href={`#benefit-${i + 1}`}
                    aria-current={on ? 'true' : undefined}
                    className="flex h-16 items-center gap-3 rounded-[8px] px-5 transition-colors duration-500"
                    style={{
                      background: on ? 'var(--z-blue-50)' : 'var(--z-50)',
                      // sprite czyta kolor kreski ze zmiennej `--21h8s6`
                      ['--21h8s6' as string]: on
                        ? 'var(--z-blue)'
                        : 'var(--z-black)',
                    }}
                  >
                    <Icon id={b.icon} size={24} />
                    <span
                      className="z-lead font-medium transition-colors duration-500"
                      style={{ color: on ? 'var(--z-blue)' : 'var(--z-black)' }}
                    >
                      {b.title}
                    </span>
                  </a>
                </motion.li>
              );
            })}
          </ul>
        </div>

        {/* karta 661 z trzema blokami — #fafafa, promień 20, padding 40 */}
        <div className="flex w-full flex-col gap-16 rounded-[20px] bg-[var(--z-50)] p-6 lg:max-w-[661px] lg:p-10">
          {BLOCKS.map((b, i) => (
            <div
              key={b.title}
              id={`benefit-${i + 1}`}
              className="flex scroll-mt-28 flex-col gap-6"
            >
              <div className="flex flex-col gap-2">
                <h3 className="z-h4">
                  <MaskRevealWords text={b.title} />
                </h3>
                <MaskReveal delay={0.12}>
                  <p className="z-lead text-[var(--z-muted)]">{b.body}</p>
                </MaskReveal>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
