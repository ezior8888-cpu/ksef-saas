'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import { DrawnVideo } from '@/components/ui/drawn-video';

import { asset } from '../_assets';
import { MaskReveal, MaskRevealWords } from './mask-reveal';

/** Krzywa i czasy zgodne z domyślnym wejściem Framera. */
const EASE = [0.44, 0, 0.56, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: EASE },
});

export function Hero() {
  return (
    <header className="relative flex flex-col pb-20">
      {/* Panel tła od góry 20 px, promień 20 — rozciąga się na całe hero
          (stałe 860 px było liczone pod usunięty „zrzut pulpitu”). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 bottom-0 top-5 rounded-[20px]"
        style={{
          background:
            'linear-gradient(180deg, #fff 0%, #fff 42%, #eff5fe 78%, #dbe8fb 100%)',
        }}
      />

      <div className="relative flex flex-col gap-20 pt-[128px]">
        <div className="mx-auto w-full max-w-[var(--z-container)] px-5 md:px-[var(--z-gutter)]">
          <div className="mx-auto flex w-full max-w-[var(--z-content)] flex-col gap-16 lg:flex-row lg:items-start lg:justify-between">
            {/* lewa kolumna — 570 px w oryginale */}
            <div className="flex w-full flex-col gap-10 lg:max-w-[550px]">
              <div className="flex flex-col gap-10">
                <motion.div {...rise(0)}>
                  <span className="z-tiny inline-flex items-center gap-2 rounded-full border border-[var(--z-300)] bg-white/70 px-3 py-1.5 text-[var(--z-black)]">
                    <span className="size-1.5 rounded-full bg-[var(--z-blue)]" />
                    Wczesny dostęp, KSeF 2.0
                  </span>
                </motion.div>

                {/* Nagłówek wychodzi zza krawędzi maski, słowo po słowie —
                    tak robi to oryginał (kontener `overflow: clip`). */}
                <h1 className="z-h1">
                  <MaskRevealWords text="Faktury do KSeF w" delay={0.05} />{' '}
                  <span className="z-mark">
                    <MaskRevealWords text="jednym kliknięciu" delay={0.22} />
                  </span>
                </h1>
              </div>

              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.75, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="mt-6 flex flex-wrap gap-3"
              >
                <Link
                  href="/register"
                  className="z-body group inline-flex items-center gap-2 rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
                >
                  Zacznij za darmo
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="#contact"
                  className="z-body inline-flex items-center rounded-[12px] border border-[var(--z-300)] bg-white px-5 py-3.5 font-medium text-[var(--z-black)] transition-colors hover:bg-[var(--z-50)]"
                >
                  Porozmawiajmy
                </Link>
              </motion.div>

              {/* Pas „logotypów klientów” usunięty 15.10.2026: były to
                  fikcyjne marki z szablonu (Pluto Inc, NovaTech…), a przed
                  startem nie mamy klientów, których moglibyśmy pokazać.
                  Wraca dopiero z prawdziwymi logotypami i zgodą klientów
                  (art. 5 i 7 ustawy o przeciwdziałaniu nieuczciwym praktykom
                  rynkowym). */}
            </div>

            {/* prawa kolumna — 365 px: film, opis, ocena */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.75, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex w-full flex-col gap-10 lg:max-w-[365px]"
            >
              <DrawnVideo
            src={asset.hero.illustration}
            width={365}
            height={274}
            className="h-auto w-full"
          />

              <div className="flex flex-col gap-3">
                <MaskReveal delay={0.3}>
                  <p className="z-body text-[var(--z-muted)]">
                    Wystawiasz fakturę, my wysyłamy ją do KSeF i pilnujemy
                    potwierdzenia. Zdjęcie paragonu trafia prosto do KPiR.
                  </p>
                </MaskReveal>
                {/* Gwiazdki „Ocena 4,8 od księgowych i mikrofirm” usunięte
                    15.10.2026 — nie było żadnych ocen. Zmyślona ocena to
                    praktyka zakazana w każdych okolicznościach (art. 7
                    pkt 23b–23c u.p.n.p.r., od 1.01.2023). */}
              </div>
            </motion.div>
          </div>
        </div>

        {/* „Zrzut pulpitu” usunięty 15.10.2026: był to panel inwestycyjny
            z szablonu (Apple, Google, Meta, $150,000) podpisany „Pulpit
            FaktFlow”. Wraca tylko prawdziwy zrzut panelu FaktWay. */}
      </div>
    </header>
  );
}
