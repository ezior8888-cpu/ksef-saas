import Link from 'next/link';

import { cn } from '@/lib/utils';

/** Wordmark FaktFlow — identyczna typografia jak na landingu. */
const WORDMARK_CLASS = 'marketing-wordmark text-[1.35rem]';

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
  const colorClass =
    variant === 'landing'
      ? 'text-[var(--marketing-text,#e2e1eb)]'
      : 'text-[var(--ff-on-surface)]';

  const mark = (
    <span className={cn(WORDMARK_CLASS, colorClass, className)}>FaktFlow</span>
  );

  if (!href) return mark;

  return (
    <Link
      href={href}
      className="inline-block transition-colors hover:text-[var(--marketing-accent,#6bfb9a)]"
    >
      {mark}
    </Link>
  );
}
