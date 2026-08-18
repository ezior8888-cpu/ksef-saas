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
        className="grid grid-cols-1 gap-x-6 gap-y-10 rounded-[16px] bg-white p-6 sm:grid-cols-2 lg:flex lg:items-stretch lg:gap-6"
      >
        {ITEMS.map((it, i) => (
          <div key={it.title} className="flex flex-1 flex-col gap-6 lg:contents">
            {/* Kreska rozdzielająca jest w oryginale osobnym elementem 1×120,
                a kolumny mają po 236 px: 4×236 + 3 kreski + 6 odstępów = 1091. */}
            {i > 0 ? (
              <span
                aria-hidden
                className="hidden w-px shrink-0 self-stretch bg-[var(--z-300)] lg:block"
              />
            ) : null}
            <div className="flex flex-col gap-6 lg:w-[236px] lg:shrink-0">
              <Icon id={it.icon} />
              <div className="flex flex-col gap-2">
                <h3 className="z-lead">{it.title}</h3>
                <p className="z-body text-[var(--z-muted)]">{it.body}</p>
              </div>
            </div>
          </div>
        ))}
      </motion.div>
    </Container>
  );
}
