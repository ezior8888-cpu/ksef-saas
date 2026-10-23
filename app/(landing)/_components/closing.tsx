'use client';

import Link from 'next/link';

import { Container, Icon } from './ui';

const COLUMNS = [
  {
    title: 'Produkt',
    links: [
      { label: 'Strona główna', href: '/' },
      { label: 'Agent FLO', href: '/#flo' },
      { label: 'Cennik', href: '/#pricing' },
      { label: 'Pytania', href: '/#faq' },
    ],
  },
  {
    title: 'Firma',
    links: [
      { label: 'O nas', href: '/about' },
      { label: 'Kontakt', href: '/kontakt' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    title: 'Więcej',
    links: [
      { label: 'Polityka prywatności', href: '/legal/polityka-prywatnosci' },
      { label: 'Regulamin', href: '/legal/regulamin' },
      { label: 'Umowa powierzenia', href: '/legal/umowa-powierzenia' },
      { label: 'Cookies', href: '/legal/cookies' },
    ],
  },
];

const SOCIAL = ['942143898', '4033599021', '1688045918'];

/** Stopka stron O nas i Blog (strona główna ma własną, app/(home)). */
export function SiteFooter() {
  return (
      <footer className="border-t border-[var(--z-300)] py-16">
      <Container className="flex flex-col gap-12">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="flex flex-col gap-5">
            {/* Sam napis do czasu nowego logo (zielony znak zdjęty 23.10.2026). */}
            <span className="z-lead font-semibold">
              Fakt<span className="text-[var(--z-blue)]">Way</span>
            </span>
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
          FaktWay. Wszystkie prawa zastrzeżone.
        </p>
      </Container>
    </footer>
  );
}
