'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

import { Container, Icon, SectionHeading } from './ui';

const PLANS = [
  {
    name: 'Start',
    body: 'Dla jednoosobowej firmy, która dopiero zaczyna.',
    price: '0 zł',
    suffix: '',
    featured: false,
    features: [
      'Do 10 faktur miesięcznie',
      'Wysyłka do KSeF i pobieranie UPO',
      'Podstawowe zestawienia',
      'Eksport do pliku',
      'Pomoc mailowa',
    ],
  },
  {
    name: 'Firma',
    body: 'Dla firm, które fakturują regularnie.',
    price: '49 zł',
    suffix: '/mies.',
    featured: true,
    features: [
      'Faktury bez limitu',
      'Zdjęcie paragonu do KPiR',
      'Przypomnienia o płatnościach',
      'Paczka dla księgowej',
      'Pomoc na czacie',
    ],
  },
  {
    name: 'Biuro',
    body: 'Dla księgowych prowadzących wielu klientów.',
    price: '99 zł',
    suffix: '/mies.',
    featured: false,
    features: [
      'Wielu klientów na jednym koncie',
      'Import z Fakturowni i inFaktu',
      'Uprawnienia dla zespołu',
      'Powiadomienia o błędach wysyłki',
      'Opiekun konta',
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
          lead="Płacisz za to, ile faktur wystawiasz. Bez umów na rok."
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{
                duration: 0.6,
                delay: i * 0.08,
                ease: [0.44, 0, 0.56, 1],
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
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
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
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
