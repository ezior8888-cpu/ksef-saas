'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

import { PRICE_GROSS, TRIAL_DAYS } from '@/lib/billing/pricing';

import { Nudge } from './anim';
import { Container, Icon, SectionHeading } from './ui';

// Jeden plan dla wszystkich (decyzja z 1 października 2026) — cena
// z lib/billing/pricing.ts.
const PLANS = [
  {
    name: 'FaktFlow',
    body: 'Jeden plan dla firm i księgowych. Wszystkie funkcje od pierwszego dnia.',
    price: PRICE_GROSS,
    suffix: '/mies. z VAT',
    featured: true,
    features: [
      'Faktury bez limitu',
      'Wysyłka do KSeF i pobieranie UPO',
      'Zdjęcie paragonu do KPiR',
      'Przypomnienia o płatnościach',
      'Paczka dla księgowej',
      'Import z Fakturowni i inFaktu',
      `${TRIAL_DAYS} dni za darmo`,
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-20 lg:py-[100px]">
      <Container className="flex flex-col gap-16">
        <SectionHeading
          align="left"
          nowrap
          title="Cennik bez gwiazdek"
          lead="Jedna cena, wszystkie funkcje. Płacisz co miesiąc, bez umów na rok."
        />

        <div className="grid max-w-[480px] grid-cols-1 gap-6">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{
                duration: 0.75,
                delay: i * 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
              className={`flex flex-col gap-6 rounded-[20px] border p-6 ${
                p.featured
                  ? 'border-transparent bg-[var(--z-black)] text-white'
                  : 'border-[var(--z-300)] bg-white'
              }`}
            >
              <div className="flex flex-col gap-2">
                <h3 className="z-h4">{p.name}</h3>
                <p
                  className={`z-body ${p.featured ? 'text-white/70' : 'text-[var(--z-muted)]'}`}
                >
                  {p.body}
                </p>
              </div>

              <div className="flex items-end gap-1">
                <span className="z-h3">{p.price}</span>
                {p.suffix ? (
                  <span
                    className={`z-small pb-1.5 ${p.featured ? 'text-white/70' : 'text-[var(--z-muted)]'}`}
                  >
                    {p.suffix}
                  </span>
                ) : null}
              </div>

              <Link
                href="/register"
                className={`z-body inline-flex items-center justify-center rounded-[12px] px-5 py-3.5 font-medium transition-transform hover:scale-[1.02] ${
                  p.featured
                    ? 'bg-white text-[var(--z-black)]'
                    : 'bg-[var(--z-black)] text-white'
                }`}
              >
                Zaczynam
              </Link>

              <ul className="flex flex-col gap-3">
                {p.features.map((f, fi) => (
                  <Nudge key={f} delay={i * 0.1 + 0.25 + fi * 0.05}>
                   <li className="flex items-start gap-2">
                    <Icon
                      id="4119102008"
                      size={20}
                      className={p.featured ? 'text-white' : ''}
                    />
                    <span
                      className={`z-body ${p.featured ? 'text-white/80' : 'text-[var(--z-muted)]'}`}
                    >
                      {f}
                    </span>
                   </li>
                  </Nudge>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
