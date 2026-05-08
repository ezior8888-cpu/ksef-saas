import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

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
    <div className="flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-orb-1 absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="animate-orb-2 absolute top-1/2 -left-40 h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[120px]" />
        <div className="animate-orb-3 absolute -bottom-40 left-1/2 h-[500px] w-[500px] rounded-full bg-green-500/10 blur-[120px]" />
      </div>

      <header
        className="sticky top-0 z-40 border-b border-glass-border bg-glass-white-strong backdrop-blur-glass-lg"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/brand/faktflow-logo.png"
              alt="FaktFlow"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-2xl object-contain bg-foreground/5 shadow-glass-sm dark:bg-white/10"
              priority
            />
            <span className="font-display font-semibold tracking-tighter-text truncate">
              FaktFlow
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <NavLink href="/pricing">Cennik</NavLink>
            <NavLink href="/vs/fakturownia">Porównania</NavLink>
            <NavLink href="/kalkulator-oszczednosci">Kalkulator</NavLink>
            <NavLink href="/blog">Blog</NavLink>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hidden px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Zaloguj
            </Link>
            <Button variant="glass-primary" size="sm" className="rounded-xl" asChild>
              <Link href="/register" className="inline-flex items-center gap-1">
                Wypróbuj 30 dni
                <ArrowRight className="ml-0.5 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-glass-border bg-glass-white-strong backdrop-blur-glass-lg">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="mb-8 grid grid-cols-2 gap-8 md:grid-cols-4">
            <FooterCol title="Produkt">
              <FooterLink href="/">Funkcje</FooterLink>
              <FooterLink href="/pricing">Cennik</FooterLink>
              <FooterLink href="/kalkulator-oszczednosci">
                Kalkulator oszczędności
              </FooterLink>
            </FooterCol>
            <FooterCol title="Porównania">
              <FooterLink href="/vs/fakturownia">vs Fakturownia</FooterLink>
              <FooterLink href="/vs/infakt">vs inFakt</FooterLink>
              <FooterLink href="/vs/wfirma">vs wFirma</FooterLink>
              <FooterLink href="/vs/ifirma">vs iFirma</FooterLink>
            </FooterCol>
            <FooterCol title="Zasoby">
              <FooterLink href="/blog">Blog</FooterLink>
              <FooterLink href="/kontakt">Kontakt</FooterLink>
              <FooterLink href="https://docs.ksef-saas.pl" target="_blank" rel="noopener noreferrer">
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
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-glass-border pt-8">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} FaktFlow. Wszystkie prawa zastrzeżone.
            </p>
            <p className="text-xs text-muted-foreground">
              Made in Poznań · Hosted in Frankfurt (EU)
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
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
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
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
      className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  );
}
