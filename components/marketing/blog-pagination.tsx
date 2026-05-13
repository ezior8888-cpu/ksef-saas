import Link from 'next/link';

function buildHref(category: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (category && category !== 'all') params.set('category', category);
  if (page > 1) params.set('page', String(page));
  const q = params.toString();
  return q ? `/blog?${q}` : '/blog';
}

interface Props {
  currentPage: number;
  totalPages: number;
  category: string | undefined;
}

export function BlogPagination({ currentPage, totalPages, category }: Props) {
  if (totalPages <= 1) return null;

  const pages: (number | 'ellipsis')[] = [];
  const window = new Set<number>();
  window.add(1);
  window.add(totalPages);
  window.add(currentPage);
  window.add(currentPage - 1);
  window.add(currentPage + 1);
  const sorted = [...window].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);

  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) pages.push('ellipsis');
    pages.push(n);
    prev = n;
  }

  return (
    <nav
      className="mt-16 flex items-center justify-center gap-2 md:gap-3"
      aria-label="Paginacja bloga"
    >
      <PaginationLink
        href={buildHref(category, currentPage - 1)}
        aria-label="Poprzednia strona"
        disabled={currentPage <= 1}
        variant="arrow"
      >
        <span className="material-symbols-outlined">chevron_left</span>
      </PaginationLink>
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`e-${i}`} className="px-2 text-sm text-[var(--blog-text-metadata)]/50">
            …
          </span>
        ) : (
          <PaginationLink
            key={p}
            href={buildHref(category, p)}
            aria-current={p === currentPage ? 'page' : undefined}
            active={p === currentPage}
          >
            {p}
          </PaginationLink>
        ),
      )}
      <PaginationLink
        href={buildHref(category, currentPage + 1)}
        aria-label="Następna strona"
        disabled={currentPage >= totalPages}
        variant="arrow"
      >
        <span className="material-symbols-outlined">chevron_right</span>
      </PaginationLink>
    </nav>
  );
}

function PaginationLink({
  href,
  children,
  disabled,
  active,
  variant,
  'aria-label': ariaLabel,
  'aria-current': ariaCurrent,
}: {
  href: string;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  variant?: 'arrow';
  'aria-label'?: string;
  'aria-current'?: 'page' | undefined;
}) {
  const base =
    'flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold transition-all md:h-12 md:w-12';
  if (disabled) {
    return (
      <span
        className={`${base} cursor-not-allowed border border-white/5 text-[var(--blog-text-metadata)]/40`}
        aria-hidden
      >
        {children}
      </span>
    );
  }
  if (active) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        aria-current={ariaCurrent}
        className={`${base} bg-[var(--blog-pagination-active-bg)] text-[var(--blog-pagination-active-text)] shadow-lg shadow-[var(--ml-primary)]/20`}
      >
        {children}
      </Link>
    );
  }
  if (variant === 'arrow') {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={`${base} border border-white/10 text-[var(--blog-text-metadata)] hover:border-[var(--ml-primary)] hover:text-[var(--ml-primary)]`}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={`${base} text-[var(--ml-on-surface-variant)] hover:bg-white/5`}
    >
      {children}
    </Link>
  );
}
