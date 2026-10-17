import {
  RiAddLine,
  RiAlarmWarningLine,
  RiBook2Line,
  RiContactsBook3Line,
  RiDashboardLine,
  RiDownload2Line,
  RiExchangeFundsLine,
  RiFileAddLine,
  RiFileList3Line,
  RiFlashlightLine,
  RiInboxArchiveLine,
  RiMoreLine,
  RiReceiptLine,
  RiSettings3Line,
  RiUpload2Line,
  RiWallet3Line,
  type RemixiconComponentType,
} from "@remixicon/react";

export interface DashboardNavItem {
  href: string;
  label: string;
  /** Ikona Remix (komponent) — sidebar, ⌘K, arkusz „Więcej". */
  icon: RemixiconComponentType;
  /** `false` = nie prefetchuj trasy (ciężkie strony). Domyślnie prefetch. */
  prefetch?: false;
}

export interface DashboardNavSection {
  /** Wielkość liter jak w planie Finora §4; UI zapisuje wersalikami. */
  title: string;
  items: DashboardNavItem[];
}

/**
 * Sekcje menu wg planu Finora §4 — tylko trasy, które istnieją. Trasy
 * z kolejnych etapów (faktury cykliczne, analizy, bank) dochodzą razem
 * ze stronami.
 */
export const dashboardNavSections: DashboardNavSection[] = [
  {
    title: "Pulpit",
    items: [
      // Dashboard JEST ekranem agenta od 30.08.2026 — osobnej pozycji „Flo”
      // nie ma (prowadziłaby tu przez przekierowanie).
      { href: "/dashboard", label: "Pulpit", icon: RiDashboardLine },
      { href: "/przeplywy", label: "Przepływy", icon: RiExchangeFundsLine },
    ],
  },
  {
    title: "Sprzedaż",
    items: [
      { href: "/invoices", label: "Faktury", icon: RiFileList3Line },
      { href: "/invoices/new", label: "Wystaw fakturę", icon: RiFileAddLine },
      {
        href: "/payments/overdue",
        label: "Przypomnienia",
        icon: RiAlarmWarningLine,
      },
      { href: "/contractors", label: "Kontrahenci", icon: RiContactsBook3Line },
    ],
  },
  {
    title: "Koszty",
    items: [
      { href: "/expenses", label: "Wydatki", icon: RiReceiptLine },
      { href: "/inbox", label: "Skrzynka KSeF", icon: RiInboxArchiveLine },
    ],
  },
  {
    title: "Księgowość",
    items: [
      { href: "/reports/kpir", label: "KPiR", icon: RiBook2Line },
      { href: "/reports/exports", label: "Eksport", icon: RiDownload2Line },
      { href: "/import-danych", label: "Import danych", icon: RiUpload2Line },
    ],
  },
];

/** Ustawienia — stopka sidebara, arkusz „Więcej" i ⌘K (poza sekcjami). */
export const dashboardSettingsNavItem: DashboardNavItem = {
  href: "/settings",
  label: "Ustawienia",
  icon: RiSettings3Line,
};

/** Płaska lista — prefetch i inne narzędzia. */
export const dashboardNavItems: DashboardNavItem[] =
  dashboardNavSections.flatMap((section) => section.items);

/**
 * Dolna nawigacja telefonu — pięć slotów z sierpniowej makiety:
 * Flo · Faktury · Nowa · Miesiąc · Więcej.
 *
 * DLACZEGO OSOBNA LISTA, A NIE WYCINEK Z `dashboardNavSections`.
 * Sidebar jest spisem miejsc; dolny pasek to CZTERY najczęstsze czynności plus
 * furtka do reszty. „Nowa" nie jest pozycją menu (to przycisk akcji, dlatego
 * w sidebarze stoi nad listą), a „Więcej" nie jest trasą. Wycinanie tego
 * z sekcji wymagałoby wyjątków w obie strony.
 *
 * Etykiety są krótsze niż w sidebarze — „Faktury" zamiast „Faktury wystawione",
 * „Miesiąc" zamiast „Przepływy" — bo na 375 px slot ma około 70 px i dłuższy
 * napis albo się łamie, albo zostaje przycięty. To nie jest zmiana nazwy
 * strony, tylko podpis ikony.
 */
export interface DashboardMobileTab {
  /** `null` = slot bez trasy (otwiera arkusz „Więcej"). */
  href: string | null;
  label: string;
  icon: RemixiconComponentType;
  /** Wyróżniony środkowy przycisk akcji (niebieskie koło). */
  emphasis?: boolean;
}

export const dashboardMobileTabs: DashboardMobileTab[] = [
  { href: "/dashboard", label: "Flo", icon: RiFlashlightLine },
  { href: "/invoices", label: "Faktury", icon: RiFileList3Line },
  { href: "/invoices/new", label: "Nowa", icon: RiAddLine, emphasis: true },
  { href: "/przeplywy", label: "Miesiąc", icon: RiWallet3Line },
  { href: null, label: "Więcej", icon: RiMoreLine },
];

/** Trasy, które mają własny slot na dole — w arkuszu „Więcej" byłyby dublem. */
const MOBILE_TAB_HREFS = new Set(
  dashboardMobileTabs
    .map((tab) => tab.href)
    .filter((href): href is string => href !== null),
);

/**
 * Sekcje do arkusza „Więcej”: to samo menu, bez pozycji, które stoją już
 * na dolnym pasku. Puste sekcje odpadają, żeby nie został sam nagłówek.
 */
export function getDashboardMoreSections(): DashboardNavSection[] {
  return dashboardNavSections
    .map((section) => ({
      title: section.title,
      items: section.items.filter((item) => !MOBILE_TAB_HREFS.has(item.href)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Czy `pathname` uznajemy za aktywną pozycję menu dla danego `href`
 * (sidebar, stan „pending” po kliknięciu).
 */
export function isActiveNavPath(pathname: string, href: string): boolean {
  // Dokładne dopasowanie: ekrany, pod którymi nie ma podstron menu.
  if (href === "/dashboard" || href === "/przeplywy" || href === "/bank") {
    return pathname === href;
  }
  // „Faktury" to lista i podgląd faktury; kreator (/invoices/new*) i faktury
  // cykliczne (/invoices/recurring*) mają własne pozycje menu.
  if (href === "/invoices") {
    if (
      pathname === "/invoices/new" ||
      pathname.startsWith("/invoices/new/") ||
      pathname === "/invoices/recurring" ||
      pathname.startsWith("/invoices/recurring/")
    ) {
      return false;
    }
    return pathname === "/invoices" || pathname.startsWith("/invoices/");
  }
  // /invoices/new, /reports/kpir, /settings, /expenses i reszta: sam adres
  // albo podstrona.
  return pathname === href || pathname.startsWith(`${href}/`);
}

const EXTRA_PREFETCH_HREFS = ["/settings", "/invoices/new"] as const;

/** Trasy do `router.prefetch` — pozycje menu + CTA + ustawienia. */
export function getDashboardPrefetchHrefs(): string[] {
  const set = new Set<string>(
    dashboardNavItems
      .filter((item) => item.prefetch !== false)
      .map((item) => item.href),
  );
  for (const href of EXTRA_PREFETCH_HREFS) {
    set.add(href);
  }
  return [...set];
}
