import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Kontener strony głównej: ta sama szerokość we wszystkich sekcjach. */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto max-w-6xl px-4 sm:px-6 lg:px-8', className)} {...props} />;
}

/**
 * Napis FaktWay w barwach panelu (jak logowanie). Logo graficzne czeka na
 * nowy znak, zielony zdjęty 23.10.2026.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('text-xl font-bold tracking-tight text-foreground', className)}>
      Fakt<span className="text-primary">Way</span>
    </span>
  );
}

const BUTTON_VARIANTS = {
  solid: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'text-foreground ring-1 ring-border hover:bg-muted',
  /** Na niebieskim tle sekcji: biały przycisk z niebieskim tekstem. */
  inverse: 'bg-primary-foreground text-primary hover:bg-primary-foreground/90',
} as const;

export function ButtonLink({
  href,
  variant = 'solid',
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof BUTTON_VARIANTS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Nagłówek sekcji: tytuł i jedno zdanie pod nim. */
export function SectionHeading({
  id,
  title,
  lead,
  className,
}: {
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto max-w-2xl text-center', className)}>
      <h2 id={id} className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {lead ? <p className="mt-4 text-lg text-pretty text-muted-foreground">{lead}</p> : null}
    </div>
  );
}

/**
 * Tło niebieskich pasów: dwie miękkie poświaty w CSS, bez plików graficznych.
 * Kolory z tokenów, więc w ciemnym motywie poświaty idą za `--primary`.
 */
export function BandGlow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        background:
          'radial-gradient(40rem 22rem at 12% 0%, color-mix(in oklch, var(--primary-foreground) 16%, transparent), transparent 70%),' +
          'radial-gradient(36rem 26rem at 95% 100%, color-mix(in oklch, var(--primary-foreground) 10%, transparent), transparent 70%)',
      }}
    />
  );
}
