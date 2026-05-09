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

/** Jedna lista tras menu — sidebar (`dashboardNavSections`). */
export const dashboardNavSections: DashboardNavSection[] = [
  {
    title: 'Dane',
    items: [
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
  const set = new Set<string>();
  for (const section of dashboardNavSections) {
    for (const item of section.items) {
      set.add(item.href);
    }
  }
  for (const href of EXTRA_PREFETCH_HREFS) {
    set.add(href);
  }
  return [...set];
}
