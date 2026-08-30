'use client';

import { usePathname } from 'next/navigation';

import { getDashboardPageTitle } from '@/lib/dashboard-page-title';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — rama panelu.
 *
 * Renderuje tytuł i podtytuł po lewej stronie paska nagłówka. Trasa bez wpisu
 * w `DASHBOARD_PAGE_TITLES` nie rysuje nic — nagłówek zostaje wtedy taki, jaki
 * był przed 30.08.2026, a strona dalej pokazuje własny `<h1>` w treści.
 */
export function DashboardPageHeading() {
  const pathname = usePathname();
  const entry = getDashboardPageTitle(pathname);
  if (!entry) return null;

  const subtitle = entry.subtitle?.(new Date());

  return (
    <div className="min-w-0">
      <h1 className="truncate text-[22px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
        {entry.title}
      </h1>
      {subtitle ? (
        <p className="mt-0.5 truncate text-[13px] text-[var(--ff-text-muted)]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
