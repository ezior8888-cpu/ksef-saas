'use client';

import { motion } from 'framer-motion';

import { Container, Icon } from './ui';

/** Zmierzone na oryginale: karta 1140×168, 4 kolumny po 236, kreski 1 px. */
const ITEMS = [
  {
    icon: '1529132500',
    title: 'AI driven forecasting',
    body: 'See AI-powered revenue and risk predictions in seconds.',
  },
  {
    icon: '3656879250',
    title: 'Unified dashboard',
    body: 'Track key metrics in one clean, customizable view.',
  },
  {
    icon: '1675043417',
    title: 'Automated reporting',
    body: 'Create clear reports instantly with no manual effort.',
  },
  {
    icon: '257698632',
    title: 'Risk detection',
    body: 'Spot unusual patterns and potential risks right away.',
  },
];

export function FeaturesStrip() {
  return (
    <Container>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.7, ease: [0.44, 0, 0.56, 1] }}
        className="grid grid-cols-1 gap-x-6 gap-y-10 rounded-[16px] bg-white p-6 sm:grid-cols-2 lg:grid-cols-[repeat(4,1fr)]"
      >
        {ITEMS.map((it, i) => (
          <div key={it.title} className="relative flex flex-col gap-6">
            {/* pionowa kreska rozdzielająca — tylko między kolumnami */}
            {i > 0 ? (
              <span
                aria-hidden
                className="absolute -left-3 top-0 hidden h-full w-px bg-[var(--z-300)] lg:block"
              />
            ) : null}
            <Icon id={it.icon} />
            <div className="flex flex-col gap-2">
              <h3 className="z-lead">{it.title}</h3>
              <p className="z-body text-[var(--z-muted)]">{it.body}</p>
            </div>
          </div>
        ))}
      </motion.div>
    </Container>
  );
}
