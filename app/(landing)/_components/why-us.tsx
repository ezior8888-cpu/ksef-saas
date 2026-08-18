'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

import { asset } from '../_assets';
import { Container, Icon } from './ui';

/**
 * Układ zmierzony na oryginale: wiersz 1140 = kolumna nagłówka 376
 * + kolumna 661 z TRZEMA blokami jeden pod drugim (odstęp 64).
 * To nie są zakładki — wszystkie trzy widać naraz.
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
  return (
    <section id="why-us" className="py-20 lg:py-[80px]">
      <Container className="flex flex-col gap-12 lg:flex-row lg:gap-[103px]">
        {/* kolumna nagłówka — 376 px, przyklejona przy przewijaniu */}
        <div className="flex flex-col gap-10 lg:w-[376px] lg:shrink-0 lg:sticky lg:top-28 lg:self-start">
          <div className="flex flex-col gap-4">
            <h2 className="z-h2">Why modern teams choose us</h2>
            <p className="z-lead text-[var(--z-muted)]">
              A smarter AI engine and financial workflow built to help teams
              move with clarity.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {BLOCKS.map((b) => (
              <li key={b.title} className="flex items-center gap-3">
                <Icon id={b.icon} size={22} />
                <span className="z-lead font-medium">{b.title}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* trzy bloki — 661 px szerokości, odstęp 64 */}
        <div className="flex w-full flex-col gap-16 lg:max-w-[661px]">
          {BLOCKS.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{
                duration: 0.65,
                delay: i * 0.05,
                ease: [0.44, 0, 0.56, 1],
              }}
              className="flex flex-col gap-6"
            >
              <div className="flex flex-col gap-3">
                <h3 className="z-h4">{b.title}</h3>
                <p className="z-lead text-[var(--z-muted)]">{b.body}</p>
              </div>
              <div className="overflow-hidden rounded-[16px] bg-[var(--z-50)]">
                <Image
                  src={b.image}
                  alt={b.title}
                  width={599}
                  height={359}
                  className="h-auto w-full"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
