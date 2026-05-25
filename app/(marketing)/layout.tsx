import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { BrandWordmark } from '@/components/brand/brand-wordmark';

export const metadata: Metadata = {
  title: {
    default: 'FaktFlow — faktury KSeF dla firm',
    template: '%s | FaktFlow',
  },
  description:
    'Wystawiaj i odbieraj faktury VAT w KSeF 2.0. Prosty SaaS dla mikrofirm i biur rachunkowych.',
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="marketing-landing relative flex min-h-screen flex-col">
      <div className="ff-mesh-gradient" aria-hidden />
      <div className="ff-orb-tr" aria-hidden />
      <div className="ff-orb-bl" aria-hidden />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(18,19,26,0.88)] backdrop-blur-md">
        <div className="relative z-[1] mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <BrandWordmark href="/" variant="landing" />

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 sm:flex lg:gap-1">
            <NavLink href="/pricing">Cennik</NavLink>
            <NavLink href="/vs/inni">Porównania</NavLink>
            <NavLink href="/kalkulator-oszczednosci">Kalkulator</NavLink>
            <NavLink href="/blog">Blog</NavLink>
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <Link
              href="/login"
              className="hidden px-3 py-2 text-sm font-semibold text-[color-mix(in_srgb,var(--marketing-muted)_90%,transparent)] transition-colors hover:text-[var(--marketing-text)] sm:inline-flex"
            >
              Zaloguj
            </Link>
            <Link href="/register" className="marketing-cta-primary px-4 py-2 text-sm">
              Wypróbuj za darmo
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
        <nav
          className="relative z-[1] flex gap-1 overflow-x-auto border-t border-white/8 px-4 py-2 sm:hidden"
          aria-label="Menu główne"
        >
          <NavLink href="/pricing">Cennik</NavLink>
          <NavLink href="/vs/inni">Porównania</NavLink>
          <NavLink href="/kalkulator-oszczednosci">Kalkulator</NavLink>
          <NavLink href="/blog">Blog</NavLink>
        </nav>
      </header>

      <main className="relative z-[1] flex-1">{children}</main>

      <footer className="relative z-[1] mt-32 border-t border-white/10 bg-[rgba(26,27,34,0.6)]">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12">
            <FooterCol title="Produkt">
              <FooterLink href="/">Funkcje</FooterLink>
              <FooterLink href="/pricing">Cennik</FooterLink>
              <FooterLink href="/kalkulator-oszczednosci">
                Kalkulator oszczędności
              </FooterLink>
            </FooterCol>
            <FooterCol title="Porównania">
              <FooterLink href="/vs/inni">vs Inni</FooterLink>
              <FooterLink href="/vs/infakt">vs inFakt</FooterLink>
              <FooterLink href="/vs/wfirma">vs wFirma</FooterLink>
              <FooterLink href="/vs/ifirma">vs iFirma</FooterLink>
            </FooterCol>
            <FooterCol title="Zasoby">
              <FooterLink href="/blog">Blog</FooterLink>
              <FooterLink href="/kontakt">Kontakt</FooterLink>
              <FooterLink
                href="https://docs.ksef-saas.pl"
                target="_blank"
                rel="noopener noreferrer"
              >
                Dokumentacja
              </FooterLink>
            </FooterCol>
            <FooterCol title="Prawo">
              <FooterLink href="/legal/regulamin">Regulamin</FooterLink>
              <FooterLink href="/legal/polityka-prywatnosci">
                Polityka prywatności
              </FooterLink>
              <FooterLink href="/legal/rodo">RODO</FooterLink>
            </FooterCol>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8">
            <p className="text-xs text-[var(--marketing-muted)]">
              © {new Date().getFullYear()} FaktFlow. Wszystkie prawa zastrzeżone.
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--marketing-muted)_70%,transparent)]">
              Made in Poznań · Hosted in Frankfurt (EU)
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-lg px-2 py-2 text-sm font-bold text-[var(--marketing-text)] transition-colors hover:text-[var(--marketing-accent)] sm:px-3.5"
    >
      {children}
    </Link>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--marketing-muted)_80%,transparent)]">
        {title}
      </p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function FooterLink({
  href,
  children,
  target,
  rel,
}: {
  href: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      className="block text-sm text-[var(--marketing-muted)] transition-colors hover:text-[var(--marketing-accent)]"
    >
      {children}
    </Link>
  );
}
