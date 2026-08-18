'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { asset } from '../_assets';
import { Container } from './ui';

const QA = [
  {
    q: 'How do I connect my financial data sources?',
    a: 'You can link banks, tools, and spreadsheets directly from the setup page with secure one click integrations.',
  },
  {
    q: 'Can I change or cancel my plan at any time?',
    a: 'Yes, you can upgrade, downgrade, or cancel your plan whenever you like with no hidden extra fees.',
  },
  {
    q: 'How secure is my data?',
    a: 'All data is encrypted in transit and at rest, and we follow industry standard security practices to keep your information protected.',
  },
  {
    q: 'Does the platform support multiple team members?',
    a: 'Yes, you can invite your team, assign specific roles, and manage permissions based on your current plan.',
  },
  {
    q: 'What integrations are included?',
    a: 'Most integrations are available on all plans, while advanced data connections are included in higher tiers.',
  },
  {
    q: 'Do you offer onboarding support?',
    a: 'Yes, we provide guided setup and extensive resources to help you get your business fully up and running.',
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-20 lg:py-[100px]">
      <Container className="flex flex-col gap-12 lg:flex-row lg:gap-16">
        {/* lewa kolumna: nagłówek + film + odsyłacz do kontaktu */}
        <div className="flex flex-col gap-8 lg:w-[420px] lg:shrink-0">
          <div className="flex flex-col gap-4">
            <h2 className="z-h2">Help and support</h2>
            <p className="z-lead text-[var(--z-muted)]">
              Answers to common questions about setup, pricing, and how
              everything works.
            </p>
          </div>

          <video
            src={asset.faq.video}
            width={200}
            height={200}
            autoPlay
            loop
            muted
            playsInline
            className="size-[200px] object-contain"
          />

          <div className="flex flex-col gap-3">
            <span className="z-lead font-medium">Still got questions?</span>
            <Link
              href="#contact"
              className="z-body inline-flex w-fit items-center rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
            >
              Contact us
            </Link>
          </div>
        </div>

        {/* prawa kolumna: rozwijane pytania — 661 px w oryginale */}
        <div className="flex w-full flex-col gap-3 lg:max-w-[661px]">
          {QA.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={item.q}
                className="overflow-hidden rounded-[16px] border border-[var(--z-300)] bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left"
                >
                  <span className="z-lead font-medium">{item.q}</span>
                  {/* ta sama ikona „plus”, obrócona o 45° w stanie otwartym */}
                  <svg
                    viewBox="0 0 24 24"
                    width={20}
                    height={20}
                    role="presentation"
                    className="shrink-0 transition-transform duration-300"
                    style={{ transform: isOpen ? 'rotate(45deg)' : 'none' }}
                  >
                    <use href="#465907804" />
                  </svg>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.44, 0, 0.56, 1] }}
                    >
                      <p className="z-body px-5 pb-5 text-[var(--z-muted)]">
                        {item.a}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
