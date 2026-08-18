import type { Metadata } from 'next';

import '@/styles/zova.css';

import { SiteFooter } from '@/app/(landing)/_components/closing';
import { IconSprite } from '@/app/(landing)/_components/icon-sprite';
import { SiteNav } from '@/app/(landing)/_components/site-nav';

export const metadata: Metadata = {
  title: {
    default: 'FaktFlow',
    template: '%s | FaktFlow',
  },
};

/**
 * Layout stron marketingowych: cennik, pomoc, regulaminy, porównania,
 * kalkulator, artykuły bloga.
 *
 * Wcześniej miał tu własny ciemny nagłówek, stopkę i tło z gradientem.
 * Teraz bierze te same elementy co strona główna, żeby klient nigdzie nie
 * trafił na poprzedni wygląd. Kolory treści zmieniają się razem z blokiem
 * `.marketing-landing` w `globals.css` — wszystkie te strony trzymają je
 * na zmiennych, więc znaczników nie trzeba było ruszać.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="zova marketing-landing relative flex min-h-screen flex-col overflow-x-clip">
      <IconSprite />
      <SiteNav />

      {/* odstęp na pływającą nawigację, która nie zajmuje miejsca w układzie */}
      <main className="flex-1 pt-[128px]">{children}</main>

      <SiteFooter />
    </div>
  );
}
