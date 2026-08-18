'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

import { asset } from '../_assets';
import { MaskReveal, MaskRevealWords } from './mask-reveal';
import { Container } from './ui';

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
              Pobierzemy dane z banku, poczty i sklepu, żebyś nie
              przepisywał ich ręcznie.
            </p>
          </MaskReveal>
        </div>

        <div className="flex w-full max-w-[946px] flex-col items-center gap-10">
          <motion.video
            src={asset.integrations.video}
            width={210}
            height={210}
            autoPlay
            loop
            muted
            playsInline
          style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.44, 0, 0.56, 1] }}
            className="size-[210px] object-contain"
          />

          <div className="flex w-full flex-wrap items-center justify-center gap-x-12 gap-y-8">
            {asset.integrations.logos.map((src, i) => (
              <motion.div
                key={src}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.04 }}
                className="flex h-7 items-center"
              >
                <Image
                  src={src}
                  alt="Logo integracji"
                  width={48}
                  height={28}
                  className="h-7 w-auto object-contain"
                />
              </motion.div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
