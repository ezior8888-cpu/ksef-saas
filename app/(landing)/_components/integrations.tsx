'use client';

import { motion } from 'framer-motion';

import { DrawnVideo } from '@/components/ui/drawn-video';
import { asset } from '../_assets';
import { MaskReveal, MaskRevealWords } from './mask-reveal';
import { Container } from './ui';

const INTEGRATIONS = [
  'KSeF (Ministerstwo Finansów)',
  'REGON (GUS)',
  'Biała lista VAT',
  'VIES',
  'Kursy walut NBP',
  'Import z Fakturowni, inFaktu, wFirmy i iFirmy (CSV)',
  'Logowanie przez Google',
];

/** Oryginał: nagłówek 550 wyśrodkowany, POD nim pas 946 z filmem i logotypami. */
export function Integrations() {
  return (
    <section className="py-20 lg:py-[80px]">
      <Container className="flex flex-col items-center gap-16">
        <div className="flex w-full max-w-[550px] flex-col items-center gap-5 text-center">
          <h2 className="z-h2 w-full">
            <MaskRevealWords text="Działa z tym, czego już używasz" />
          </h2>
          <MaskReveal delay={0.18}>
            <p className="z-lead text-[var(--z-muted)]">
              Dane kontrahentów pobieramy z rejestrów publicznych, faktury
              z KSeF, a historię przeniesiesz z innego programu do faktur.
            </p>
          </MaskReveal>
        </div>

        <div className="flex w-full max-w-[946px] flex-col items-center gap-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <DrawnVideo
                src={asset.integrations.video}
                width={210}
                height={210}
                className="size-[210px] object-contain"
              />
            </motion.div>

          {/* Do 15.10.2026: fikcyjne logotypy z szablonu i obietnica
              „pobierzemy dane z banku, poczty i sklepu” — takich integracji
              nie ma. Lista niżej ma pokrycie w kodzie (lib/ksef, lib/gus,
              lib/validation, lib/nbp, lib/import/csv-parsers, logowanie Google).
              Nowa pozycja tylko razem z działającą integracją. */}
          <ul className="flex w-full flex-wrap items-center justify-center gap-3">
            {INTEGRATIONS.map((name, i) => (
              <motion.li
                key={name}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.55, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="z-body rounded-full border border-[var(--z-300)] bg-white px-4 py-2 text-[var(--z-black)]"
              >
                {name}
              </motion.li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
