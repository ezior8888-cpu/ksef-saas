'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

const EXPORTS_HREF = '/reports/exports';

const exportsLinkClassName =
  'group/link ff-glass-pane flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--ff-primary)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--ff-primary)_14%,transparent)] hover:text-[var(--ff-primary)] hover:shadow-[0_10px_28px_rgba(107,251,154,0.18)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ff-primary)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

/** Prefetch RSC `/reports/exports` gdy user jest w `(dashboard)` — skraca opóźnienie pierwszego kliku. */
export function PrefetchExportsRoute() {
  const router = useRouter();
  useEffect(() => {
    void router.prefetch(EXPORTS_HREF);
  }, [router]);
  return null;
}

/**
 * Link „Eksport PDF” na dashboardzie: agresywny prefetch + natychmiastowy stan „busy”
 * na pointerdown (zanim App Router dokończy soft navigation).
 */
export function DashboardExportsPdfLink() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const armPrefetch = useCallback(() => {
    void router.prefetch(EXPORTS_HREF);
  }, [router]);

  useEffect(() => {
    void router.prefetch(EXPORTS_HREF);
  }, [router]);

  return (
    <Link
      href={EXPORTS_HREF}
      prefetch
      onPointerEnter={armPrefetch}
      onFocus={armPrefetch}
      onPointerDown={() => {
        armPrefetch();
        setBusy(true);
      }}
      aria-busy={busy}
      className={cn(exportsLinkClassName, busy && 'cursor-wait opacity-90')}
    >
      <span
        className={cn(
          'material-symbols-outlined text-[18px] transition-transform duration-200 ease-out group-hover/link:-translate-y-px group-hover/link:scale-110',
          busy && 'animate-spin',
        )}
      >
        {busy ? 'progress_activity' : 'print'}
      </span>
      <span className="transition-transform duration-200 ease-out group-hover/link:translate-x-0.5">
        {busy ? 'Przechodzenie…' : 'Eksport PDF'}
      </span>
    </Link>
  );
}
