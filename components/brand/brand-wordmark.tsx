import Link from 'next/link';

import { cn } from '@/lib/utils';

/** Wordmark FaktFlow — identyczna typografia jak na landingu. */
const WORDMARK_CLASS = 'marketing-wordmark text-[1.35rem]';

/**
 * Wariant panelu (prototyp): Inter 700, prosta antykwa (bez kursywy),
 * dwutonowo — „Fakt" w kolorze tekstu, „Flow" w akcencie.
 */
const APP_WORDMARK_CLASS =
  'text-[22px] font-bold leading-none tracking-[-0.02em] text-[var(--ff-on-surface)]';

type BrandWordmarkProps = {
  /** Na landingu i w panelu: jasny wordmark na ciemnym tle. */
  variant?: 'landing' | 'app';
  href?: string;
  className?: string;
};

export function BrandWordmark({
  variant = 'landing',
  href,
  className,
}: BrandWordmarkProps) {
  const mark =
    variant === 'app' ? (
      <span className={cn(APP_WORDMARK_CLASS, className)}>
        Fakt<span className="text-[var(--ff-accent)]">Flow</span>
      </span>
    ) : (
      <span
        className={cn(
          WORDMARK_CLASS,
          'text-[var(--marketing-text,#e2e1eb)]',
          className,
        )}
      >
        FaktFlow
      </span>
    );

  if (!href) return mark;

  return (
    <Link
      href={href}
      className={cn(
        'inline-block transition-colors',
        variant === 'app'
          ? 'hover:opacity-80'
          : 'hover:text-[var(--marketing-accent,#6bfb9a)]',
      )}
    >
      {mark}
    </Link>
  );
}
