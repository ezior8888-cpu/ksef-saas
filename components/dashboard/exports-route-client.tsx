'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

const EXPORTS_HREF = '/reports/exports';

/**
 * Przycisk konturowy z prototypu: przezroczyste tło, ramka `#2a3442`,
 * na hover ramka i tekst przechodzą w akcent. Bez podnoszenia i skalowania —
 * prototyp reaguje wyłącznie kolorem.
 */
const exportsLinkClassName =
  'group/link flex shrink-0 cursor-pointer items-center gap-2 rounded-[9px] border border-[var(--ff-border-strong)] bg-transparent px-4 py-[9px] text-[13px] font-medium text-[var(--ff-text-soft)] transition-colors hover:border-[var(--ff-accent)] hover:text-[var(--ff-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ff-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ff-surface)]';

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
          'material-symbols-outlined text-[15px] leading-none',
          busy && 'animate-spin',
        )}
      >
        {busy ? 'progress_activity' : 'print'}
      </span>
      <span>{busy ? 'Przechodzenie…' : 'Eksport PDF'}</span>
    </Link>
  );
}
