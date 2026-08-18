'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import { asset } from '../_assets';
import { MaskReveal, MaskRevealWords } from './mask-reveal';
import { Icon } from './ui';

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
      {/* Panel tła: 1400×860 od góry 20 px, promień 20 — pod hero i pulpitem. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-5 h-[860px] rounded-[20px]"
        style={{
          background:
            'linear-gradient(180deg, #fff 0%, #fff 42%, #eff5fe 78%, #dbe8fb 100%)',
        }}
      />

      <div className="relative flex flex-col gap-20 pt-[160px]">
        <div className="mx-auto w-full max-w-[var(--z-container)] px-5 md:px-[var(--z-gutter)]">
          <div className="mx-auto flex w-full max-w-[var(--z-content)] flex-col gap-16 lg:flex-row lg:items-start lg:justify-between">
            {/* lewa kolumna — 570 px w oryginale */}
            <div className="flex w-full flex-col gap-10 lg:max-w-[550px]">
              <div className="flex flex-col gap-10">
                <motion.div {...rise(0)}>
                  <span className="z-tiny inline-flex items-center gap-2 rounded-full border border-[var(--z-300)] bg-white/70 px-3 py-1.5 text-[var(--z-black)]">
                    <span className="size-1.5 rounded-full bg-[var(--z-blue)]" />
                    Now available for early access
                  </span>
                </motion.div>

                {/* Nagłówek wychodzi zza krawędzi maski, słowo po słowie —
                    tak robi to oryginał (kontener `overflow: clip`). */}
                <h1 className="z-h1">
                  <MaskRevealWords text="Real-time insight for" delay={0.05} />{' '}
                  <span className="z-mark">
                    <MaskRevealWords text="modern finance" delay={0.22} />
                  </span>
                </h1>
              </div>

              <motion.div {...rise(0.16)} className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="z-body group inline-flex items-center gap-2 rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
                >
                  Get free trial
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="#contact"
                  className="z-body inline-flex items-center rounded-[12px] border border-[var(--z-300)] bg-white px-5 py-3.5 font-medium text-[var(--z-black)] transition-colors hover:bg-[var(--z-50)]"
                >
                  Contact sales
                </Link>
              </motion.div>

              {/* Pas logotypów klientów: w oryginale <ul> 513×26 tuż pod
                  przyciskami. Wcześniej go przeoczyłem. */}
              <motion.ul
                {...rise(0.2)}
                className="flex max-w-[513px] flex-wrap items-center gap-x-[5px] gap-y-3 lg:flex-nowrap"
              >
                {asset.hero.clientLogos.map((src) => (
                  <li key={src} className="flex h-[26px] items-center">
                    <Image
                      src={src}
                      alt="Logo klienta"
                      width={130}
                      height={26}
                      className="h-[26px] w-auto object-contain opacity-70 transition-opacity hover:opacity-100"
                    />
                  </li>
                ))}
              </motion.ul>
            </div>

            {/* prawa kolumna — 365 px: film, opis, ocena */}
            <motion.div
              {...rise(0.24)}
              className="flex w-full flex-col gap-10 lg:max-w-[365px]"
            >
              <video
                src={asset.hero.illustration}
                width={365}
                height={274}
                autoPlay
                loop
                muted
                playsInline
                className="h-auto w-full"
              />

              <div className="flex flex-col gap-3">
                <MaskReveal delay={0.3}>
                  <p className="z-body text-[var(--z-muted)]">
                    Powerful AI platform simplifying reporting and delivering
                    forecasts for faster decisions.
                  </p>
                </MaskReveal>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Icon
                        key={i}
                        id="2930526878"
                        size={14}
                        className="text-[var(--z-yellow)]"
                      />
                    ))}
                  </div>
                  <span className="z-small text-[var(--z-muted)]">
                    4.8 rated by 8K+ users
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* zrzut pulpitu — 969×579, wystaje poza dolną krawędź panelu */}
        <motion.div
          initial={{ opacity: 0, y: 48 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.32, ease: EASE }}
          className="mx-auto w-full max-w-[var(--z-container)] px-5 md:px-[var(--z-gutter)]"
        >
          {/* Proporcje 969×579 wymuszone kadrowaniem: plik źródłowy ma
              2880×2048 (inny stosunek boków), a oryginał go przycina. */}
          <div className="relative mx-auto aspect-[969/579] w-full max-w-[969px] overflow-hidden rounded-[16px] bg-white shadow-[0_24px_60px_-20px_rgba(16,32,64,0.28)]">
            <Image
              src={asset.hero.dashboard}
              alt="Pulpit aplikacji"
              fill
              sizes="(max-width: 1024px) 100vw, 969px"
              priority
              className="object-cover object-top"
            />
          </div>
        </motion.div>
      </div>
    </header>
  );
}
