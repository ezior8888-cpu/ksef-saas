'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';

import { asset } from '../_assets';
import { Container, Icon } from './ui';

const COLUMNS = [
  {
    title: 'Produkt',
    links: [
      { label: 'Strona główna', href: '/' },
      { label: 'Cennik', href: '/#pricing' },
      { label: 'Możliwości', href: '/#why-us' },
      { label: 'Pytania', href: '/#faq' },
    ],
  },
  {
    title: 'Firma',
    links: [
      { label: 'O nas', href: '/about' },
      { label: 'Kontakt', href: '/#contact' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    title: 'Więcej',
    links: [
      { label: 'Polityka prywatności', href: '/legal/polityka-prywatnosci' },
      { label: 'Regulamin', href: '/legal/regulamin' },
    ],
  },
];

const SOCIAL = ['942143898', '4033599021', '1688045918'];

export function Closing() {
  return (
    <>
      {/* wezwanie do działania na ciemnym tle */}
      <section className="pb-20">
        <Container>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-8 rounded-[24px] bg-[var(--z-black)] px-6 py-16 text-center text-white"
          >
            <div className="flex w-full max-w-[550px] flex-col gap-4">
              <h2 className="z-h2">
                Wystaw pierwszą fakturę jeszcze dziś
              </h2>
              <p className="z-lead text-white/70">
                Trzydzieści dni za darmo, bez podawania karty. Jeśli nie
                podejdzie, po prostu odchodzisz.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="z-body inline-flex items-center rounded-[12px] bg-white px-5 py-3.5 font-medium text-[var(--z-black)] transition-transform hover:scale-[1.02]"
              >
                Zacznij za darmo
              </Link>
              <Link
                href="#pricing"
                className="z-body inline-flex items-center rounded-[12px] border border-white/25 px-5 py-3.5 font-medium text-white transition-colors hover:bg-white/10"
              >
                Zobacz cennik
              </Link>
            </div>
          </motion.div>
        </Container>
      </section>
    </>
  );
}

/** Stopka wspólna dla strony głównej i O nas. */
export function SiteFooter() {
  return (
      <footer className="border-t border-[var(--z-300)] py-16">
      <Container className="flex flex-col gap-12">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="flex flex-col gap-5">
            <Image src={asset.logo} alt="FaktFlow" width={32} height={32} />
            <span className="z-lead font-medium">Bądźmy w kontakcie</span>
            <div className="flex gap-3">
              {SOCIAL.map((id) => (
                <span
                  key={id}
                  className="flex size-10 items-center justify-center rounded-full border border-[var(--z-300)]"
                >
                  <Icon id={id} size={18} />
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {COLUMNS.map((c) => (
              <div key={c.title} className="flex flex-col gap-3">
                <span className="z-body font-medium">{c.title}</span>
                {c.links.map((l) => (
                  <Link
                    key={l.label}
                    href={l.href}
                    className="z-body text-[var(--z-muted)] transition-colors hover:text-[var(--z-black)]"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>

        <p className="z-small text-[var(--z-muted)]">
          FaktFlow. Wszystkie prawa zastrzeżone.
        </p>
      </Container>
    </footer>
  );
}
