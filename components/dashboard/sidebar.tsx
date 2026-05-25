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
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors active:opacity-90',
        active
          ? 'ff-sidebar-active font-semibold text-[var(--ff-primary)]'
          : 'text-[color-mix(in_srgb,var(--ff-on-surface-variant)_80%,transparent)] hover:bg-white/5',
      )}
    >
      <span
        className={cn(
          'material-symbols-outlined text-[22px]',
          active && 'text-[var(--ff-primary)]',
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
        'ff-shell-sidebar relative z-[2] hidden h-full min-h-0 w-72 shrink-0 flex-col gap-[var(--ff-unit)] overflow-y-auto p-[var(--ff-gutter)] lg:flex',
        drawer && 'flex m-0 w-full max-w-none border-0 bg-transparent p-4',
      )}
    >
      <div className="mb-8 px-2">
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
          'mb-8 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ff-on-surface)] px-6 py-4 text-[15px] font-bold text-[var(--ff-bg)] transition-transform hover:scale-[1.02] active:scale-95',
          newInvoiceNavPending &&
            'ring-2 ring-[var(--ff-primary)] ring-offset-2 ring-offset-[color-mix(in_srgb,var(--ff-surface-container-low)_100%,transparent)]',
        )}
      >
        <span className="material-symbols-outlined text-[22px] text-[var(--ff-bg)]">
          add
        </span>
        Nowa faktura
      </Link>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {dashboardNavSections.map((section, sIdx) => (
          <div key={section.title} className={sIdx > 0 ? 'mt-6' : undefined}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_40%,transparent)]">
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

        <div className="mt-auto pt-10">
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
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors active:opacity-90',
              settingsActive
                ? 'ff-sidebar-active font-semibold text-[var(--ff-primary)]'
                : 'text-[color-mix(in_srgb,var(--ff-on-surface-variant)_80%,transparent)] hover:bg-white/5',
            )}
          >
            <span
              className={cn(
                'material-symbols-outlined text-[22px]',
                settingsActive && 'text-[var(--ff-primary)]',
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
