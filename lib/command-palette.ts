import { RiAddLine, RiFileAddLine, type RemixiconComponentType } from '@remixicon/react';

import { dashboardNavSections, dashboardSettingsNavItem } from '@/lib/dashboard-nav-config';

export interface PaletteEntry {
  /** Tytuł grupy w palecie („Przejdź do" albo „Akcje"). */
  group: string;
  label: string;
  /**
   * Unikalna wartość cmdk (`grupa:etykieta`). „Wystaw fakturę” jest i w menu,
   * i w akcjach — zdublowana wartość psuje nawigację strzałkami.
   */
  value: string;
  href: string;
  icon: RemixiconComponentType;
  /** Dodatkowe słowa dla dopasowania cmdk (np. nazwa sekcji menu). */
  keywords: string[];
}

export const PALETTE_NAV_GROUP = 'Przejdź do';
export const PALETTE_ACTIONS_GROUP = 'Akcje';

export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 80;

/** Pozycje menu + ustawienia + dwie akcje. Czysta funkcja — bez dostępu do DOM. */
export function buildPaletteNavEntries(): PaletteEntry[] {
  const nav: PaletteEntry[] = dashboardNavSections.flatMap((section) =>
    section.items.map((item) => ({
      group: PALETTE_NAV_GROUP,
      label: item.label,
      value: `${PALETTE_NAV_GROUP}:${item.label}`,
      href: item.href,
      icon: item.icon,
      keywords: [item.label, section.title],
    })),
  );
  nav.push({
    group: PALETTE_NAV_GROUP,
    label: dashboardSettingsNavItem.label,
    value: `${PALETTE_NAV_GROUP}:${dashboardSettingsNavItem.label}`,
    href: dashboardSettingsNavItem.href,
    icon: dashboardSettingsNavItem.icon,
    keywords: [dashboardSettingsNavItem.label, 'konfiguracja'],
  });
  const actions: PaletteEntry[] = [
    {
      group: PALETTE_ACTIONS_GROUP,
      label: 'Wystaw fakturę',
      value: `${PALETTE_ACTIONS_GROUP}:Wystaw fakturę`,
      href: '/invoices/new',
      icon: RiFileAddLine,
      keywords: ['Wystaw fakturę', 'nowa', 'faktura', 'sprzedaż'],
    },
    {
      group: PALETTE_ACTIONS_GROUP,
      label: 'Dodaj wydatek',
      value: `${PALETTE_ACTIONS_GROUP}:Dodaj wydatek`,
      href: '/expenses',
      icon: RiAddLine,
      keywords: ['Dodaj wydatek', 'koszt', 'paragon', 'zdjęcie'],
    },
  ];
  return [...nav, ...actions];
}

/** Fraza do wyszukiwania na serwerze: przycięta, do 80 znaków, `null` gdy krótsza niż 2. */
export function normalizeSearchQuery(q: string): string | null {
  const t = q.trim().slice(0, MAX_SEARCH_LENGTH).trim();
  return t.length < MIN_SEARCH_LENGTH ? null : t;
}
