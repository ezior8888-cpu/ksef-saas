export interface DashboardNavItem {
  href: string;
  label: string;
  /** Material Symbols Outlined ligatura (jak w makiecie HTML). */
  icon: string;
}

export interface DashboardNavSection {
  title: string;
  items: DashboardNavItem[];
}

/** Sekcje menu — sidebar (nagłówki: Dane, Księgowość, …). */
export const dashboardNavSections: DashboardNavSection[] = [
  {
    title: 'Dane',
    items: [
      // FLO stoi nad Dashboardem, bo to on jest teraz głównym ekranem
      // produktu — reszta menu to miejsca, do których zagląda się rzadziej.
      // Dashboard JEST ekranem agenta od 30.08.2026 (decyzja właściciela
      // produktu). Osobna pozycja „Flo” prowadziłaby do tego samego miejsca
      // przez przekierowanie, więc została zdjęta.
      { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      {
        href: '/przeplywy',
        label: 'Przepływy',
        icon: 'account_balance_wallet',
      },
      { href: '/invoices', label: 'Faktury wystawione', icon: 'description' },
      { href: '/payments/overdue', label: 'Przeterminowane', icon: 'error' },
      { href: '/inbox', label: 'Skrzynka odbiorcza', icon: 'inbox' },
      { href: '/expenses', label: 'Wydatki', icon: 'receipt_long' },
      { href: '/contractors', label: 'Kontrahenci', icon: 'group' },
    ],
  },
  {
    title: 'Księgowość',
    items: [
      { href: '/reports/kpir', label: 'KPiR', icon: 'book' },
      { href: '/reports/exports', label: 'Eksport', icon: 'download' },
    ],
  },
];

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
  icon: string;
  /** Wyróżniony środkowy przycisk akcji (niebieskie koło). */
  emphasis?: boolean;
}

export const dashboardMobileTabs: DashboardMobileTab[] = [
  { href: '/dashboard', label: 'Flo', icon: 'bolt' },
  { href: '/invoices', label: 'Faktury', icon: 'description' },
  { href: '/invoices/new', label: 'Nowa', icon: 'add', emphasis: true },
  { href: '/przeplywy', label: 'Miesiąc', icon: 'account_balance_wallet' },
  { href: null, label: 'Więcej', icon: 'more_horiz' },
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
  if (href === '/przeplywy') {
    return pathname === '/przeplywy';
  }
  if (href === '/invoices/new') return pathname === '/invoices/new';
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/reports/kpir') {
    return (
      pathname === '/reports/kpir' || pathname.startsWith('/reports/kpir/')
    );
  }
  if (href === '/invoices') {
    if (pathname === '/invoices/new') return false;
    return pathname === '/invoices' || pathname.startsWith('/invoices/');
  }
  if (href === '/expenses') {
    return pathname === '/expenses' || pathname.startsWith('/expenses/');
  }
  if (href === '/settings')
    return pathname === '/settings' || pathname.startsWith('/settings/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

const EXTRA_PREFETCH_HREFS = ['/settings', '/invoices/new'] as const;

/** Trasy do `router.prefetch` — pozycje menu + CTA + ustawienia. */
export function getDashboardPrefetchHrefs(): string[] {
  const set = new Set<string>(dashboardNavItems.map((item) => item.href));
  for (const href of EXTRA_PREFETCH_HREFS) {
    set.add(href);
  }
  return [...set];
}
