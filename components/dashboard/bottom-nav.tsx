'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { signOut } from '@/app/(auth)/login/actions';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { OTWORZ_POMOC } from '@/lib/support/open-support-event';
import {
  dashboardMobileTabs,
  getDashboardMoreSections,
  isActiveNavPath,
  type DashboardMobileTab,
} from '@/lib/dashboard-nav-config';
import { cn } from '@/lib/utils';

/**
 * Dolna nawigacja telefonu — pasek z sierpniowej makiety.
 *
 * DLACZEGO W OGÓLE, SKORO BYŁ HAMBURGER. Panel dostał się na telefon dopiero
 * we wrześniu 2026 (zdjęcie BUG-008), a jedyną nawigacją była szuflada z lewej
 * spod hamburgera. Na telefonie oznacza to dwa dotknięcia do każdej strony
 * i kciuk w górnym lewym rogu — najdalszym miejscu ekranu. Pasek na dole to
 * jedno dotknięcie, w zasięgu kciuka.
 *
 * PRÓG `lg`, nie `md`: sidebar znika dokładnie tam (`sidebar.tsx`), więc
 * między `md` a `lg` nie ma okna, w którym nie byłoby żadnej nawigacji.
 * Tablet dostaje ten sam pasek zamiast hamburgera — jeden wzorzec zamiast
 * dwóch na tej samej szerokości.
 *
 * Podświetlenie idzie tym samym torem co w sidebarze: `pointerdown` ustawia
 * cel natychmiast, nie czekając, aż Next dokończy nawigację RSC. Bez tego
 * pasek wygląda na zepsuty przez pierwsze kilkaset milisekund.
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setPendingHref(null);
    setMoreOpen(false);
  }, [pathname]);

  const highlightedHref = useMemo(() => {
    if (pendingHref !== null && !isActiveNavPath(pathname, pendingHref)) {
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

  const moreSections = useMemo(() => getDashboardMoreSections(), []);

  /**
   * „Więcej" jest aktywne, gdy jesteśmy na trasie, która nie ma własnego
   * slotu — inaczej wejście w Wydatki czy KPiR gasi cały pasek i klient nie
   * widzi, gdzie jest.
   */
  const moreActive =
    moreOpen ||
    (highlightedHref === null &&
      !dashboardMobileTabs.some(
        (tab) => tab.href !== null && isActiveNavPath(pathname, tab.href),
      ));

  return (
    <>
      <nav
        aria-label="Nawigacja główna"
        className="ff-bottom-nav fixed inset-x-0 bottom-0 z-40 flex items-stretch lg:hidden"
      >
        {dashboardMobileTabs.map((tab) => (
          <BottomNavSlot
            key={tab.label}
            tab={tab}
            active={tab.href === null ? moreActive : isHrefActive(tab.href)}
            onBeginNav={setPendingHref}
            onPrefetch={(href) => void router.prefetch(href)}
            onOpenMore={() => setMoreOpen(true)}
          />
        ))}
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="ff-dashboard max-h-[85dvh] overflow-y-auto rounded-t-2xl border-[var(--ff-border)] pb-[calc(1rem+var(--ff-safe-b))] text-[var(--ff-on-surface)]"
        >
          <SheetTitle className="text-left text-base font-semibold text-[var(--ff-text-strong)]">
            Więcej
          </SheetTitle>

          {moreSections.map((section) => (
            <div key={section.title} className="min-w-0">
              <p className="px-1 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ff-text-faint)]">
                {section.title}
              </p>
              <div className="flex flex-col">
                {section.items.map((item) => (
                  <MoreRow
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isActiveNavPath(pathname, item.href)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-1 min-w-0 border-t border-[var(--ff-border)] pt-2">
            <MoreRow
              href="/settings"
              label="Ustawienia"
              icon="settings"
              active={isActiveNavPath(pathname, '/settings')}
            />

            {/* Pomoc jest tu, bo na telefonie pływający bąbelek jest ukryty —
                siadał na przycisku „Zapisz” w przyklejonym pasku formularzy. */}
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                window.dispatchEvent(new Event(OTWORZ_POMOC));
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--ff-text)] transition-colors hover:bg-[var(--ff-row-hover)]"
            >
              <span
                aria-hidden
                className="material-symbols-outlined flex size-5 shrink-0 text-[20px]"
              >
                help
              </span>
              Pomoc
            </button>
          </div>

          {/* Wylogowanie zeszło tu z górnego paska — na 375 px nie mieściło
              się obok wordmarku i przełącznika organizacji, a jest czynnością
              rzadką. Przełącznika motywu tu NIE MA celowo: księżyc stoi
              w pasku nagłówka (tak jak w makiecie), a ten sam przełącznik
              w dwóch miejscach to zagadka, nie wygoda. */}
          <form action={signOut} className="border-t border-[var(--ff-border)] pt-2">
            <button
              type="submit"
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--ff-text-muted)] transition-colors hover:bg-[var(--ff-row-hover)] hover:text-[var(--ff-text)]"
            >
              <span
                aria-hidden
                className="material-symbols-outlined flex size-5 shrink-0 text-[20px]"
              >
                logout
              </span>
              Wyloguj
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

function shouldHandlePrimaryInAppNav(e: ReactPointerEvent): boolean {
  return (
    e.pointerType !== 'mouse' ||
    (e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey)
  );
}

/**
 * Jeden slot paska. Wyróżniony („Nowa") rysuje się jako niebieskie koło
 * wyniesione ponad krawędź — tak jak w makiecie i tak, jak działa to
 * w aplikacjach, z których klient korzysta na co dzień.
 */
function BottomNavSlot({
  tab,
  active,
  onBeginNav,
  onPrefetch,
  onOpenMore,
}: {
  tab: DashboardMobileTab;
  active: boolean;
  onBeginNav: (href: string) => void;
  onPrefetch: (href: string) => void;
  onOpenMore: () => void;
}) {
  // 44 px to minimalny cel dotykowy z wytycznych Apple i Google; slot ma
  // pełną wysokość paska, więc trafienie jest łatwiejsze niż w samą ikonę.
  const slotClass =
    'flex flex-1 select-none flex-col items-center justify-center gap-1 pt-2 text-[11px] font-medium leading-none transition-colors';

  if (tab.emphasis && tab.href !== null) {
    return (
      <Link
        href={tab.href}
        prefetch
        aria-current={active ? 'page' : undefined}
        onPointerDown={(e) => {
          if (!shouldHandlePrimaryInAppNav(e)) return;
          onBeginNav(tab.href!);
        }}
        className={cn(slotClass, 'text-[var(--ff-accent)]')}
      >
        <span
          aria-hidden
          className="-mt-5 flex size-11 items-center justify-center rounded-full bg-[var(--ff-primary)] text-[var(--ff-on-primary)] shadow-[0_4px_12px_rgba(37,99,235,0.35)] transition-transform active:scale-95"
        >
          <span className="material-symbols-outlined text-[24px] leading-none">
            {tab.icon}
          </span>
        </span>
        <span className="-mt-3">{tab.label}</span>
      </Link>
    );
  }

  const content = (
    <>
      <span
        aria-hidden
        className="material-symbols-outlined text-[22px] leading-none"
      >
        {tab.icon}
      </span>
      <span>{tab.label}</span>
    </>
  );

  const toneClass = active
    ? 'text-[var(--ff-accent)]'
    : 'text-[var(--ff-text-muted)]';

  if (tab.href === null) {
    return (
      <button
        type="button"
        onClick={onOpenMore}
        aria-expanded={active}
        className={cn(slotClass, toneClass, 'pb-[var(--ff-safe-b)]')}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={tab.href}
      prefetch
      aria-current={active ? 'page' : undefined}
      onPointerDown={(e) => {
        if (!shouldHandlePrimaryInAppNav(e)) return;
        onBeginNav(tab.href!);
      }}
      onPointerEnter={() => onPrefetch(tab.href!)}
      className={cn(slotClass, toneClass, 'pb-[var(--ff-safe-b)]')}
    >
      {content}
    </Link>
  );
}

function MoreRow({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
        active
          ? 'ff-sidebar-active text-[var(--ff-accent)]'
          : 'text-[var(--ff-text)] hover:bg-[var(--ff-row-hover)]',
      )}
    >
      <span
        aria-hidden
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
}
