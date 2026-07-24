'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { BrandWordmark } from '@/components/brand/brand-wordmark';
import {
  dashboardNavSections,
  isActiveNavPath,
} from '@/lib/dashboard-nav-config';
import { cn } from '@/lib/utils';

function shouldHandlePrimaryInAppNav(e: ReactPointerEvent): boolean {
  return (
    e.pointerType !== 'mouse' ||
    (e.button === 0 &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey)
  );
}

interface NavRowProps {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  onPrimaryDown: (href: string) => void;
  onPrefetchHover: (href: string) => void;
}

/**
 * Pojedynczy wiersz nawigacji — `memo` po stricte równym zestawie propsów.
 * Dzięki temu zmiana `pendingHref` w rodzicu re-renderuje **wyłącznie** dwa
 * wiersze (poprzedni aktywny + nowy), a nie całą listę 9 linków.
 */
const NavRow = memo(function NavRow({
  href,
  label,
  icon,
  active,
  onPrimaryDown,
  onPrefetchHover,
}: NavRowProps) {
  return (
    <Link
      href={href}
      prefetch
      onPointerDown={(e) => {
        if (!shouldHandlePrimaryInAppNav(e)) return;
        onPrimaryDown(href);
      }}
      onPointerEnter={() => onPrefetchHover(href)}
      onFocus={() => onPrefetchHover(href)}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-[11px] text-sm font-medium transition-colors active:opacity-90',
        active
          ? 'ff-sidebar-active text-[var(--ff-accent)]'
          : 'text-[var(--ff-text-muted)] hover:bg-[var(--ff-row-hover)] hover:text-[var(--ff-text)]',
      )}
    >
      <span
        className={cn(
          'material-symbols-outlined flex size-5 shrink-0 text-[20px]',
          active && 'text-[var(--ff-accent)]',
        )}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
});

/**
 * Podświetlenie menu odłączone od momentu, w którym Next dokończy RSC:
 * `pointerdown` ustawia „cel” natychmiast (urgent state); szybkie kolejne
 * kliknięcia nadpisują cel. Memoizacja `NavRow` izoluje koszt re-renderu
 * przy „spamowaniu kliknięć”.
 */
export function Sidebar({ drawer }: { drawer?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const beginNavTo = useCallback(
    (href: string) => {
      if (isActiveNavPath(pathname, href)) {
        setPendingHref(null);
        return;
      }
      setPendingHref(href);
    },
    [pathname],
  );

  const armPrefetch = useCallback(
    (href: string) => {
      void router.prefetch(href);
    },
    [router],
  );

  /** Obecnie podświetlana trasa: pending wygrywa, dopóki URL nie dogoni. */
  const highlightedHref = useMemo(() => {
    if (
      pendingHref !== null &&
      !isActiveNavPath(pathname, pendingHref)
    ) {
      return pendingHref;
    }
    return null;
  }, [pathname, pendingHref]);

  const isHrefActive = useCallback(
    (href: string) => {
      if (highlightedHref !== null) return href === highlightedHref;
      return isActiveNavPath(pathname, href);
    },
    [pathname, highlightedHref],
  );

  const newInvoiceNavPending = highlightedHref === '/invoices/new';
  const settingsActive = isHrefActive('/settings');

  return (
    <aside
      className={cn(
        'ff-shell-sidebar relative z-[2] hidden h-full min-h-0 w-[280px] shrink-0 flex-col overflow-y-auto px-5 py-7 lg:flex',
        drawer && 'flex m-0 w-full max-w-none border-0 bg-transparent p-4',
      )}
    >
      <div className="px-2 pb-7">
        <BrandWordmark href="/dashboard" variant="app" />
      </div>

      <Link
        href="/invoices/new"
        prefetch
        onPointerDown={(e) => {
          if (!shouldHandlePrimaryInAppNav(e)) return;
          beginNavTo('/invoices/new');
        }}
        onPointerEnter={() => armPrefetch('/invoices/new')}
        onFocus={() => armPrefetch('/invoices/new')}
        className={cn(
          'flex w-full items-center justify-center gap-2.5 rounded-[10px] bg-[var(--ff-accent)] px-4 py-[13px] text-sm font-semibold text-[var(--ff-on-primary)] transition-colors hover:bg-[var(--ff-accent-hover)]',
          newInvoiceNavPending &&
            'ring-2 ring-[var(--ff-accent)] ring-offset-2 ring-offset-[var(--ff-surface-sidebar)]',
        )}
      >
        <span className="material-symbols-outlined text-[18px] text-[var(--ff-on-primary)]">
          add
        </span>
        Nowa faktura
      </Link>

      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {dashboardNavSections.map((section) => (
          <div key={section.title}>
            <p className="px-2 pb-2.5 pt-7 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ff-text-faint)]">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavRow
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isHrefActive(item.href)}
                  onPrimaryDown={beginNavTo}
                  onPrefetchHover={armPrefetch}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-auto pt-7">
          <Link
            href="/settings"
            prefetch
            onPointerDown={(e) => {
              if (!shouldHandlePrimaryInAppNav(e)) return;
              beginNavTo('/settings');
            }}
            onPointerEnter={() => armPrefetch('/settings')}
            onFocus={() => armPrefetch('/settings')}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-[11px] text-sm font-medium transition-colors active:opacity-90',
              settingsActive
                ? 'ff-sidebar-active text-[var(--ff-accent)]'
                : 'text-[var(--ff-text-muted)] hover:bg-[var(--ff-row-hover)] hover:text-[var(--ff-text)]',
            )}
          >
            <span
              className={cn(
                'material-symbols-outlined flex size-5 shrink-0 text-[20px]',
                settingsActive && 'text-[var(--ff-accent)]',
              )}
            >
              settings
            </span>
            Ustawienia
          </Link>
        </div>
      </nav>
    </aside>
  );
}
