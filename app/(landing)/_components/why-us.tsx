'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import { asset } from '../_assets';
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
const BLOCKS = [
  {
    icon: '450316432',
    title: 'Real-time intelligence',
    body: 'Get instant insights and forecasts powered by advanced AI so your team can make decisions with clarity.',
    image: asset.whyUs.shotA,
  },
  {
    icon: '1283949305',
    title: 'Effortless workflow',
    body: 'A simple and intuitive interface that removes friction and keeps your financial operations moving smoothly.',
    image: asset.whyUs.shotB,
  },
  {
    icon: '1430394497',
    title: 'Reliable accuracy',
    body: 'Consistent, data-driven analysis that helps teams effectively reduce risk and stay ahead of the curve with confidence.',
    image: asset.whyUs.shotA,
  },
];

export function WhyUs() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        // wybieramy blok najbliżej środka okna
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length === 0) return;
        const idx = refs.current.indexOf(visible[0].target as HTMLDivElement);
        if (idx !== -1) setActive(idx);
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section id="why-us" className="py-20 lg:py-20">
      <Container className="flex flex-col gap-12 lg:flex-row lg:gap-[103px]">
        {/* kolumna nagłówka — 376 px */}
        <div className="flex flex-col gap-10 lg:w-[376px] lg:shrink-0 lg:sticky lg:top-28 lg:self-start">
          <div className="flex flex-col gap-4">
            <h2 className="z-h2">
              <MaskRevealWords text="Why modern teams choose us" />
            </h2>
            <MaskReveal delay={0.18}>
              <p className="z-lead text-[var(--z-muted)]">
                A smarter AI engine and financial workflow built to help teams
                move with clarity.
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
              ref={(el) => {
                refs.current[i] = el;
              }}
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
              <motion.div
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden rounded-[16px] bg-white"
              >
                <Image
                  src={b.image}
                  alt={b.title}
                  width={599}
                  height={359}
                  className="h-auto w-full"
                />
              </motion.div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
