import Link from 'next/link';

import { cn } from '@/lib/utils';

export type InvoicesTab = 'wystawione' | 'cykliczne' | 'po-terminie';

/** Zakładki Faktur — każda to osobna strona z własnym adresem (stare adresy zostają). */
export const INVOICES_TABS: readonly { value: InvoicesTab; label: string; href: string }[] = [
  { value: 'wystawione', label: 'Wystawione', href: '/invoices' },
  { value: 'cykliczne', label: 'Cykliczne', href: '/invoices/recurring' },
  { value: 'po-terminie', label: 'Po terminie', href: '/payments/overdue' },
];

/**
 * Pierwszy rząd karty z tabelą na ekranach Faktur (poprawka Bartosza 21.10.2026:
 * jedna pozycja „Faktury” w menu zamiast trzech). Wygląd zakładek „line” Finory
 * (`investments/equities/comparison-chart-card.tsx`: `TabsList variant='line'`
 * w całej szerokości karty, wyzwalacze `px-4`, podkreślenie aktywnej), ale
 * semantyka nawigacji: zakładka przełącza stronę, więc `<nav>` z linkami
 * i `aria-current`, a nie `role="tablist"` bez paneli.
 *
 * Wymiary jak w makiecie z `TabsList`/`TabsTrigger`: rząd `h-11` z dolną ramką
 * i `pt-[3px]`, zakładka o 1 px niższa, podkreślenie `h-0.5` tuż nad ramką.
 * Na telefonie mniejsze wcięcia, żeby trzy zakładki zmieściły się na 375 px.
 */
export function InvoicesTabs({ active }: { active: InvoicesTab }) {
  return (
    <nav aria-label="Rodzaje faktur" className="flex h-11 w-full shrink-0 items-start border-b px-1 pt-[3px] sm:px-4">
      {INVOICES_TABS.map((tab) => {
        const current = tab.value === active;
        return (
          <Link
            key={tab.value}
            href={tab.href}
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
          </Link>
        );
      })}
    </nav>
  );
}
