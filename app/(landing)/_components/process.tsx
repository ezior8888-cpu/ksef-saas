'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

import { asset } from '../_assets';
import { Container, SectionHeading } from './ui';

const STEPS = [
  {
    n: '01',
    title: 'Podłącz firmę',
    body: 'Wpisujesz NIP, resztę danych pobieramy z rejestru.',
    image: asset.process.stepA,
  },
  {
    n: '02',
    title: 'Wystaw fakturę',
    body: 'Uzupełniasz pozycje, my pilnujemy poprawności pliku.',
    image: asset.process.stepC,
  },
  {
    n: '03',
    title: 'Wyślij do KSeF',
    body: 'Jedno kliknięcie i masz numer oraz potwierdzenie.',
    image: asset.process.stepB,
  },
];

export function Process() {
  return (
    <section className="bg-[var(--z-50)] py-20 lg:py-[100px]">
      <Container className="flex flex-col gap-16">
        <SectionHeading
          title="Zaczynasz w trzy kroki"
          lead="Pierwszą fakturę wystawisz w kilka minut."
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                duration: 0.6,
                delay: i * 0.08,
                ease: [0.44, 0, 0.56, 1],
              }}
              className="flex flex-col gap-6 rounded-[20px] bg-white p-6 transition-shadow duration-300 hover:shadow-[0_16px_40px_-16px_rgba(16,32,64,0.22)]"
            >
              <div className="flex h-[180px] items-center justify-center">
                <Image
                  src={s.image}
                  alt={s.title}
                  width={307}
                  height={307}
                  className="h-full w-auto object-contain"
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="z-small text-[var(--z-muted)]">{s.n}</span>
                <h3 className="z-h4">{s.title}</h3>
                <p className="z-body text-[var(--z-muted)]">{s.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
