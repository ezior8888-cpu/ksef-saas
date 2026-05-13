'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: { href: string; label: string; match: (pathname: string) => boolean }[] = [
  { href: '/pricing', label: 'Cennik', match: (p) => p === '/pricing' },
  { href: '/vs/fakturownia', label: 'Porównania', match: (p) => p.startsWith('/vs') },
  { href: '/kalkulator-oszczednosci', label: 'Kalkulator', match: (p) => p === '/kalkulator-oszczednosci' },
  { href: '/blog', label: 'Blog', match: (p) => p === '/blog' || p.startsWith('/blog/') },
];

export function MarketingHeaderNav() {
  const pathname = usePathname();

  return (
    <div className="hidden items-center gap-8 md:flex">
      {LINKS.map(({ href, label, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? 'border-b-2 border-[var(--ml-primary)] pb-1 text-sm font-bold tracking-wide text-[var(--ml-primary)] transition-all'
                : 'text-sm font-medium tracking-wide text-[var(--ml-on-surface-variant)] transition-all duration-300 hover:text-[var(--ml-primary)]'
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
