import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  dashboardMobileTabs,
  dashboardNavItems,
  dashboardNavSections,
  getDashboardMoreSections,
  getDashboardPrefetchHrefs,
  isActiveNavPath,
} from '@/lib/dashboard-nav-config';

describe('isActiveNavPath (plan Finora §4)', () => {
  it('/invoices nie jest aktywne dla kreatora /invoices/new', () => {
    for (const p of ['/invoices/new', '/invoices/new/regular']) {
      expect(isActiveNavPath(p, '/invoices'), p).toBe(false);
    }
  });

  it('/invoices jest aktywne dla listy i podglądu faktury', () => {
    expect(isActiveNavPath('/invoices', '/invoices')).toBe(true);
    expect(isActiveNavPath('/invoices/abc-uuid', '/invoices')).toBe(true);
  });

  it('/invoices/new jest aktywne dla siebie i kroków kreatora', () => {
    expect(isActiveNavPath('/invoices/new', '/invoices/new')).toBe(true);
    expect(isActiveNavPath('/invoices/new/regular', '/invoices/new')).toBe(
      true,
    );
    expect(isActiveNavPath('/invoices', '/invoices/new')).toBe(false);
  });

  it('/bank jest aktywne tylko dla dokładnie /bank', () => {
    expect(isActiveNavPath('/bank', '/bank')).toBe(true);
    expect(isActiveNavPath('/bank/operacje', '/bank')).toBe(false);
  });

  it('/dashboard i /przeplywy tylko dokładnie', () => {
    expect(isActiveNavPath('/dashboard', '/dashboard')).toBe(true);
    expect(isActiveNavPath('/dashboard/x', '/dashboard')).toBe(false);
    expect(isActiveNavPath('/przeplywy', '/przeplywy')).toBe(true);
    expect(isActiveNavPath('/przeplywy/x', '/przeplywy')).toBe(false);
  });

  it('/reports/kpir, /settings, /expenses i domyślne reguły po prefiksie', () => {
    expect(isActiveNavPath('/reports/kpir', '/reports/kpir')).toBe(true);
    expect(isActiveNavPath('/reports/kpir/2026', '/reports/kpir')).toBe(true);
    expect(isActiveNavPath('/reports/kpirx', '/reports/kpir')).toBe(false);
    expect(isActiveNavPath('/reports/exports', '/reports/kpir')).toBe(false);
    expect(isActiveNavPath('/settings/ksef', '/settings')).toBe(true);
    expect(isActiveNavPath('/settingsx', '/settings')).toBe(false);
    expect(isActiveNavPath('/expenses/abc', '/expenses')).toBe(true);
    expect(isActiveNavPath('/inbox/abc', '/inbox')).toBe(true);
    expect(isActiveNavPath('/inboxx', '/inbox')).toBe(false);
    expect(isActiveNavPath('/contractors', '/contractors')).toBe(true);
  });
});

describe('zakładki ekranu Faktur (poprawka 21.10.2026)', () => {
  // Cykliczne i po terminie to zakładki „Faktur”, nie pozycje menu — w menu
  // świeci wtedy „Faktury”, a „Wystaw fakturę” nie.
  it('„Faktury” są aktywne dla /invoices/recurring* i /payments/overdue*', () => {
    for (const p of ['/invoices/recurring', '/invoices/recurring/x', '/payments/overdue', '/payments/overdue/x']) {
      expect(isActiveNavPath(p, '/invoices'), p).toBe(true);
      expect(isActiveNavPath(p, '/invoices/new'), p).toBe(false);
    }
    expect(isActiveNavPath('/payments/overduex', '/invoices')).toBe(false);
    expect(isActiveNavPath('/payments', '/invoices')).toBe(false);
  });

  it('w menu nie ma osobnych pozycji dla zakładek', () => {
    const hrefs = dashboardNavItems.map((i) => i.href);
    expect(hrefs).not.toContain('/invoices/recurring');
    expect(hrefs).not.toContain('/payments/overdue');
  });

  it('zakładki mają prefetch (przełączenie jak pozycja menu), w przeciwieństwie do /analizy/*', () => {
    expect(getDashboardPrefetchHrefs()).toEqual(
      expect.arrayContaining(['/invoices/recurring', '/payments/overdue']),
    );
  });
});

describe('struktura menu (plan Finora §4)', () => {
  it('sekcje, etykiety i adresy w kolejności', () => {
    expect(
      dashboardNavSections.map((s) => ({
        title: s.title,
        items: s.items.map((i) => [i.label, i.href]),
      })),
    ).toEqual([
      {
        title: 'Pulpit',
        items: [
          ['Pulpit', '/dashboard'],
          ['Przepływy', '/przeplywy'],
        ],
      },
      {
        title: 'Sprzedaż',
        items: [
          ['Faktury', '/invoices'],
          ['Wystaw fakturę', '/invoices/new'],
          // Poprawka 21.10.2026: „Faktury cykliczne” i „Przypomnienia” są zakładkami
          // ekranu „Faktury” — świadoma zmiana struktury menu (Sprzedaż: 5 → 3 pozycje).
          ['Kontrahenci', '/contractors'],
        ],
      },
      {
        title: 'Koszty',
        items: [
          ['Wydatki', '/expenses'],
          ['Skrzynka KSeF', '/inbox'],
        ],
      },
      // Plan Finora E7: sekcja „Analizy” dochodzi razem ze stronami P10/P11
      // (zasada wpinania §4) — świadoma zmiana oczekiwanej struktury menu.
      {
        title: 'Analizy',
        items: [
          ['Analiza sprzedaży', '/analizy/sprzedaz'],
          ['Analiza kosztów', '/analizy/koszty'],
        ],
      },
      {
        title: 'Księgowość',
        items: [
          ['KPiR', '/reports/kpir'],
          ['Eksport', '/reports/exports'],
          ['Import danych', '/import-danych'],
        ],
      },
    ]);
  });

  it('każdy adres menu ma katalog trasy w app/(dashboard)', () => {
    const root = join(process.cwd(), 'app', '(dashboard)');
    const hrefs = [
      ...dashboardNavItems.map((i) => i.href),
      ...dashboardMobileTabs.flatMap((t) => (t.href ? [t.href] : [])),
    ];
    for (const href of hrefs) {
      const dir = join(root, ...href.split('/').filter(Boolean));
      expect(existsSync(dir), href).toBe(true);
    }
  });

  it('każda pozycja ma ikonę (komponent)', () => {
    for (const item of dashboardNavItems) {
      expect(item.icon, item.href).toBeTruthy();
    }
    for (const tab of dashboardMobileTabs) {
      expect(tab.icon, tab.label).toBeTruthy();
    }
  });

  it('dolny pasek: etykiety i kolejność bez zmian', () => {
    expect(dashboardMobileTabs.map((t) => [t.label, t.href])).toEqual([
      ['Pulpit', '/dashboard'],
      ['Faktury', '/invoices'],
      ['Nowa', '/invoices/new'],
      ['Miesiąc', '/przeplywy'],
      ['Więcej', null],
    ]);
    expect(dashboardMobileTabs.find((t) => t.label === 'Nowa')?.emphasis).toBe(
      true,
    );
  });

  it('getDashboardMoreSections odrzuca zakładki dolnego paska i puste sekcje', () => {
    const more = getDashboardMoreSections();
    const hrefs = more.flatMap((s) => s.items.map((i) => i.href));
    for (const tab of dashboardMobileTabs) {
      if (tab.href) expect(hrefs).not.toContain(tab.href);
    }
    expect(more.every((s) => s.items.length > 0)).toBe(true);
    // „Pulpit" ma obie pozycje na dolnym pasku — sekcja odpada w całości.
    expect(more.map((s) => s.title)).toEqual([
      'Sprzedaż',
      'Koszty',
      'Analizy',
      'Księgowość',
    ]);
    expect(more[0].items.map((i) => i.href)).toEqual(['/contractors']);
  });

  it('getDashboardPrefetchHrefs pomija pozycje z prefetch: false', () => {
    const withoutPrefetch = dashboardNavItems.filter(
      (i) => i.prefetch === false,
    );
    const hrefs = getDashboardPrefetchHrefs();
    for (const item of withoutPrefetch) {
      expect(hrefs).not.toContain(item.href);
    }
    expect(hrefs).toContain('/invoices');
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('/analizy/* bez prefetchu (ciężkie agregaty, plan Finora §4)', () => {
    const analizy = dashboardNavItems.filter((i) => i.href.startsWith('/analizy/'));
    expect(analizy.map((i) => i.href)).toEqual(['/analizy/sprzedaz', '/analizy/koszty']);
    for (const item of analizy) expect(item.prefetch, item.href).toBe(false);
    const hrefs = getDashboardPrefetchHrefs();
    expect(hrefs.filter((h) => h.startsWith('/analizy'))).toEqual([]);
  });

  it('/analizy/sprzedaz i /analizy/koszty aktywne po regule ogólnej, bez przecieku między sobą', () => {
    expect(isActiveNavPath('/analizy/sprzedaz', '/analizy/sprzedaz')).toBe(true);
    expect(isActiveNavPath('/analizy/koszty', '/analizy/sprzedaz')).toBe(false);
    expect(isActiveNavPath('/analizy/sprzedazx', '/analizy/sprzedaz')).toBe(false);
  });
});
