'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { DrawnVideo } from '@/components/ui/drawn-video';

import { asset } from '../_assets';
import { MaskReveal, MaskRevealWords } from './mask-reveal';
import { Rise } from './anim';
import { Container } from './ui';

const QA = [
  {
    q: 'Czy muszę mieć podpis elektroniczny?',
    a: 'Nie. Wystarczy token z KSeF albo profil zaufany. Przeprowadzimy Cię przez to przy zakładaniu konta.',
  },
  {
    q: 'Co się dzieje, gdy KSeF nie odpowiada?',
    a: 'Faktura czeka w kolejce, a my wysyłamy ją automatycznie, gdy system wróci. Dostajesz wtedy powiadomienie.',
  },
  {
    q: 'Czy moja księgowa dostanie dostęp?',
    a: 'Tak. Zapraszasz ją na konto, a ona sama pobiera komplet dokumentów za wybrany okres.',
  },
  {
    q: 'Gdzie trzymacie moje dane?',
    a: 'Na serwerach w Niemczech, szyfrowane. Faktury przechowujemy dziesięć lat, tak jak wymagają przepisy.',
  },
  {
    q: 'Czy mogę zrezygnować w każdej chwili?',
    a: 'Tak. Nie ma umowy na czas określony ani opłaty za wyjście.',
  },
  {
    q: 'Przeniesiecie moje dane z innego programu?',
    a: 'Tak. Wgrywasz plik z Fakturowni albo inFaktu, resztę robimy my.',
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-20 lg:py-[100px]">
      <Container className="flex flex-col gap-12 lg:flex-row lg:gap-16">
        {/* lewa kolumna: nagłówek + film + odsyłacz do kontaktu */}
        <div className="flex flex-col gap-8 lg:w-[376px] lg:shrink-0">
          <div className="flex flex-col gap-4">
            <h2 className="z-h2 w-full">
              <MaskRevealWords text="Pytania i odpowiedzi" />
            </h2>
            <MaskReveal delay={0.18}>
              <p className="z-lead text-[var(--z-muted)]">
                Krótko o tym, jak to działa, ile kosztuje i co z danymi.
              </p>
            </MaskReveal>
          </div>

          <DrawnVideo
            src={asset.faq.video}
            width={200}
            height={200}
            className="size-[200px] object-contain"
          />

          <div className="flex flex-col gap-3">
            <span className="z-lead font-medium">Nie znalazłeś odpowiedzi?</span>
            <Link
              href="#contact"
              className="z-body inline-flex w-fit items-center rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
            >
              Napisz do nas
            </Link>
          </div>
        </div>

        {/* prawa kolumna: rozwijane pytania — 661 px w oryginale */}
        <div className="flex w-full flex-col gap-3 lg:max-w-[661px]">
          {QA.map((item, i) => {
            const isOpen = open === i;
            return (
              <Rise
                key={item.q}
                delay={i * 0.07}
                className="overflow-hidden rounded-[16px] border border-[var(--z-300)] bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left"
                >
                  <span className="z-lead font-medium">{item.q}</span>
                  {/* ta sama ikona „plus”, obrócona o 45° w stanie otwartym */}
                  <svg
                    viewBox="0 0 24 24"
                    width={20}
                    height={20}
                    role="presentation"
                    className="shrink-0 transition-transform duration-300"
                    style={{ transform: isOpen ? 'rotate(45deg)' : 'none' }}
                  >
                    <use href="#465907804" />
                  </svg>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.44, 0, 0.56, 1] }}
                    >
                      <p className="z-body px-5 pb-5 text-[var(--z-muted)]">
                        {item.a}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </Rise>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
