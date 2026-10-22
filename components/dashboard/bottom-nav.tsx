"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  RiLogoutBoxRLine,
  RiQuestionLine,
  type RemixiconComponentType,
} from "@remixicon/react";

import { signOut } from "@/app/(auth)/login/actions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { OTWORZ_POMOC } from "@/lib/support/open-support-event";
import {
  dashboardMobileTabs,
  dashboardSettingsNavItem,
  getDashboardMoreSections,
  isActiveNavPath,
  type DashboardMobileTab,
} from "@/lib/dashboard-nav-config";
import { cn } from "@/lib/utils";

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
                    prefetch={item.prefetch !== false}
                    active={isActiveNavPath(pathname, item.href)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-1 min-w-0 border-t border-[var(--ff-border)] pt-2">
            <MoreRow
              href={dashboardSettingsNavItem.href}
              label={dashboardSettingsNavItem.label}
              icon={dashboardSettingsNavItem.icon}
              active={isActiveNavPath(pathname, dashboardSettingsNavItem.href)}
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
              <RiQuestionLine aria-hidden className="size-5 shrink-0" />
              Pomoc
            </button>
          </div>

          {/* Ustawienia i Wyloguj są też w menu profilu paska górnego (od
              21.10.2026 pasek 1:1 z Finory, widoczny na każdej szerokości).
              Tu zostają celowo: arkusz „Więcej” to nawigacja telefonu, a sama
              Finora też dubluje zębatkę i „Settings” w menu profilu.
              Przełącznika motywu tu NIE MA: księżyc stoi w pasku górnym. */}
          <form
            action={signOut}
            className="border-t border-[var(--ff-border)] pt-2"
          >
            <button
              type="submit"
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--ff-text-muted)] transition-colors hover:bg-[var(--ff-row-hover)] hover:text-[var(--ff-text)]"
            >
              <RiLogoutBoxRLine aria-hidden className="size-5 shrink-0" />
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
    e.pointerType !== "mouse" ||
    (e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey)
  );
}

/**
 * Jeden slot paska. Wyróżniony („Nowa") rysuje się jako niebieskie koło
 * z plusem, bez widocznego podpisu.
 *
 * Poprawka Bartosza 21.10.2026: koło nie jest już wyniesione ponad krawędź
 * paska (dawne `-mt-5`) i nie ma pod sobą napisu „Nowa” (dawne `-mt-3`).
 * Napis nachodził na dół koła, więc zamiast go przesuwać, koło stoi teraz
 * dokładnie tam, gdzie był napis, a sam napis zostaje tylko dla czytników
 * ekranu (`sr-only`) — link nadal ma nazwę dostępną „Nowa”. Odstępy
 * paska od bezpiecznego obszaru (`--ff-safe-b`) zostają bez zmian.
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
    "flex flex-1 select-none flex-col items-center justify-center gap-1 pt-2 text-[11px] font-medium leading-none transition-colors";

  if (tab.emphasis && tab.href !== null) {
    return (
      <Link
        href={tab.href}
        prefetch
        aria-current={active ? "page" : undefined}
        onPointerDown={(e) => {
          if (!shouldHandlePrimaryInAppNav(e)) return;
          onBeginNav(tab.href!);
        }}
        // `pb-[var(--ff-safe-b)]` jak w pozostałych slotach: bez niego na iPhonie
        // z paskiem domowym koło, już nie uniesione, zjeżdżałoby w strefę paska.
        className={cn(slotClass, "pb-[var(--ff-safe-b)]", "text-[var(--ff-accent)]")}
      >
        <span
          aria-hidden
          className="flex size-11 items-center justify-center rounded-full bg-[var(--ff-primary)] text-[var(--ff-on-primary)] shadow-md shadow-primary/30 transition-transform active:scale-95"
        >
          <tab.icon aria-hidden className="size-6" />
        </span>
        {/* Nazwa dostępna dla czytników ekranu i testów; wzrokowo zasłania ją
            koło (poprawka Bartosza 21.10.2026). */}
        <span className="sr-only">{tab.label}</span>
      </Link>
    );
  }

  const content = (
    <>
      <tab.icon aria-hidden className="size-5" />
      <span>{tab.label}</span>
    </>
  );

  const toneClass = active
    ? "text-[var(--ff-accent)]"
    : "text-[var(--ff-text-muted)]";

  if (tab.href === null) {
    return (
      <button
        type="button"
        onClick={onOpenMore}
        aria-expanded={active}
        className={cn(slotClass, toneClass, "pb-[var(--ff-safe-b)]")}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={tab.href}
      prefetch
      aria-current={active ? "page" : undefined}
      onPointerDown={(e) => {
        if (!shouldHandlePrimaryInAppNav(e)) return;
        onBeginNav(tab.href!);
      }}
      onPointerEnter={() => onPrefetch(tab.href!)}
      className={cn(slotClass, toneClass, "pb-[var(--ff-safe-b)]")}
    >
      {content}
    </Link>
  );
}

function MoreRow({
  href,
  label,
  icon: Icon,
  active,
  prefetch = true,
}: {
  href: string;
  label: string;
  icon: RemixiconComponentType;
  /** `false` dla ciężkich stron (`/analizy/*`, plan Finora §4). */
  prefetch?: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        active
          ? "ff-sidebar-active text-[var(--ff-accent)]"
          : "text-[var(--ff-text)] hover:bg-[var(--ff-row-hover)]",
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-5 shrink-0", active && "text-[var(--ff-accent)]")}
      />
      {label}
    </Link>
  );
}
