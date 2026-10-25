import Link from 'next/link';

import { LinkPendingMark } from '@/components/navigation/link-pending-mark';
import { cn } from '@/lib/utils';

/** Zakładka ekranu z listą — osobna strona z własnym adresem. */
export interface SectionTab<T extends string = string> {
  value: T;
  label: string;
  href: string;
}

/**
 * Pierwszy rząd karty z tabelą na ekranach z zakładkami (Faktury, Koszty —
 * poprawka Bartosza 21.10.2026: jedna pozycja w menu zamiast kilku). Wygląd
 * zakładek „line” Finory (`investments/equities/comparison-chart-card.tsx`:
 * `TabsList variant='line'` w całej szerokości karty, wyzwalacze `px-4`,
 * podkreślenie aktywnej), ale semantyka nawigacji: zakładka przełącza stronę,
 * więc `<nav>` z linkami i `aria-current`, a nie `role="tablist"` bez paneli.
 *
 * Wymiary jak w makiecie z `TabsList`/`TabsTrigger`: rząd `h-11` z dolną ramką
 * i `pt-[3px]`, zakładka o 1 px niższa, podkreślenie `h-0.5` tuż nad ramką.
 * Na telefonie mniejsze wcięcia, żeby trzy zakładki zmieściły się na 375 px.
 *
 * Komponent serwerowy (bez stanu): aktywną zakładkę podaje strona.
 *
 * PŁYNNOŚĆ NA TELEFONIE (zgłoszenie Bartosza 23.10.2026). Linki mają pełny
 * prefetch (`prefetch`), bo domyślny dla stron dynamicznych pobiera tylko
 * szkielet: przejście z „Wystawione” na „Cykliczne” czekało wtedy na serwer
 * z podkreśleniem w starym miejscu, a „Po terminie” (inny segment) zamieniało
 * całą stronę — z kaflami i tym rzędem — na ogólny szkielet. Gdy strona
 * jeszcze nie przyszła, `LinkPendingMark` przenosi podkreślenie na dotkniętą
 * zakładkę od razu (`.ff-section-tabs` w `globals.css`).
 */
export function SectionTabs<T extends string>({
  label,
  tabs,
  active,
}: {
  /** `aria-label` nawigacji, np. „Rodzaje faktur”. */
  label: string;
  tabs: readonly SectionTab<T>[];
  active: T;
}) {
  return (
    <nav aria-label={label} className="ff-section-tabs flex h-11 w-full shrink-0 items-start border-b px-1 pt-[3px] sm:px-4">
      {tabs.map((tab) => {
        const current = tab.value === active;
        return (
          <Link
            key={tab.value}
            href={tab.href}
            prefetch
            aria-current={current ? 'page' : undefined}
            className={cn(
              'relative inline-flex h-[calc(100%-1px)] items-center justify-center px-3 text-sm font-medium whitespace-nowrap transition-all outline-none sm:px-4',
              'focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1',
              'after:bg-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:opacity-0 after:transition-opacity',
              current
                ? 'text-foreground after:opacity-100'
                : 'text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground',
            )}
          >
            {tab.label}
            <LinkPendingMark />
          </Link>
        );
      })}
    </nav>
  );
}
