import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Karta z listą: tabela od `lg`, karty poniżej.
 *
 * SKĄD SIĘ WZIĘŁA. Wzorzec istniał od dawna w `components/invoices/invoice-list.tsx`
 * (tabela `hidden lg:block` + osobna lista kart), ale nie był z niczego wspólnego,
 * więc trzy pozostałe listy w panelu — skrzynka, kontrahenci i zaległości —
 * miały samą tabelę `min-w-[880px]` w `overflow-x-auto`. Na telefonie znaczyło
 * to przesuwanie ekranu w bok przy KAŻDYM wierszu, żeby zobaczyć kwotę.
 *
 * Tabela zostaje bez zmian, bo na komputerze jest właściwą formą: kolumny
 * liczb wyrównują się do przecinka i da się porównać wiersze wzrokiem.
 * Poniżej `lg` ta sama treść idzie kartami — jeden wiersz to jedna karta.
 *
 * `overflow-x-auto` zostaje mimo wszystko: przy zawężonym oknie na komputerze
 * (1024–1100 px) tabela 880 px nadal bywa szersza niż miejsce na nią, a
 * przewijanie WEWNĄTRZ karty jest w porządku — w przeciwieństwie do
 * przewijania całej strony w bok.
 */
export function ResponsiveTable({
  title,
  subtitle,
  table,
  cards,
  toolbar,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Zawartość `<table>` — renderowana od `lg`. */
  table: ReactNode;
  /** Ta sama treść jako karty — renderowana poniżej `lg`. */
  cards: ReactNode;
  /** Opcjonalny pasek nad listą (filtry, akcje). */
  toolbar?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'ff-glass-pane overflow-hidden rounded-[var(--ff-radius-lg)]',
        className,
      )}
    >
      <div className="border-b border-[var(--ff-border)] px-4 py-4 sm:px-[22px] sm:py-[18px]">
        <h2 className="text-[15px] font-semibold text-[var(--ff-text-strong)]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-[13px] text-[var(--ff-text-muted)]">
            {subtitle}
          </p>
        ) : null}
        {toolbar}
      </div>

      <div className="hidden overflow-x-auto lg:block">{table}</div>

      <div className="divide-y divide-[var(--ff-row-divider)] lg:hidden">
        {cards}
      </div>
    </div>
  );
}

/**
 * Jeden wiersz listy jako karta.
 *
 * Układ jest zawsze taki sam, bo wszystkie cztery listy w panelu mówią to samo
 * w tej samej kolejności: KTO, CO, ZA ILE. Tytuł i kwota w jednym rzędzie
 * (kwota po prawej, mono — żeby dało się porównać dwie karty wzrokiem),
 * pod spodem drobniejsze szczegóły, na końcu opcjonalne akcje.
 */
export function ResponsiveTableCard({
  title,
  subtitle,
  amount,
  amountNote,
  meta,
  actions,
  href,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  amount?: ReactNode;
  amountNote?: ReactNode;
  /** Drobne szczegóły pod tytułem — data, numer, status. */
  meta?: ReactNode;
  actions?: ReactNode;
  href?: string;
}) {
  const tresc = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[var(--ff-on-surface)]">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--ff-text-dim)]">
              {subtitle}
            </p>
          ) : null}
        </div>

        {amount !== undefined ? (
          <div className="shrink-0 text-right">
            <p className="font-mono text-[14px] font-semibold tabular-nums text-[var(--ff-on-surface)]">
              {amount}
            </p>
            {amountNote ? (
              <p className="mt-0.5 text-[11px] text-[var(--ff-text-dim)]">
                {amountNote}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {meta ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--ff-text-muted)]">
          {meta}
        </div>
      ) : null}

      {actions ? (
        <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </>
  );

  // `min-h-11` na całej karcie: wiersz listy jest celem dotykowym, gdy niesie
  // odsyłacz, a 44 px to minimum z wytycznych Apple i Google.
  const klasy = 'block px-4 py-3.5';

  if (href) {
    return (
      <a href={href} className={cn(klasy, 'transition-colors active:bg-[var(--ff-row-hover)]')}>
        {tresc}
      </a>
    );
  }

  return <div className={klasy}>{tresc}</div>;
}
