'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import type { FloAction, FloProposalView } from '@/types/flo';

import { clockLabel, timeLeft } from './format';

/**
 * Karta bazowa agenta (krok 3 toru B).
 *
 * TO JEST CAŁY INTERFEJS AGENTA. 33 funkcje z katalogu renderują się przez
 * sześć wariantów tej karty — dlatego rozgałęzienie po `variant` stoi tutaj,
 * w jednym miejscu, i dlatego karta nie wie nic o tym, która funkcja ją
 * wyprodukowała. Nowa funkcja po stronie silnika pojawia się w gotowym
 * interfejsie sama.
 *
 * Na razie wszystkie sześć gałęzi prowadzi do wyglądu `info` — warianty
 * dostają własne ciała w krokach 5–10. Gałęzie są wypisane jawnie, a nie
 * schowane pod `default`, żeby kompilator wskazał to miejsce, gdyby doszedł
 * siódmy wariant.
 *
 * CZEGO TU JESZCZE NIE MA (i w którym kroku dochodzi):
 * - sekcja „dlaczego to widzę” z `evidence` — krok 17
 * - pasek cofnięcia dla `undoableUntil` — krok 18
 * - wpięcie akcji serwerowych — razem z wariantami i krokiem 19
 */

/** Co karta robi po kliknięciu. Brak = przyciski są nieczynne. */
export type FloActionHandler = (
  action: FloAction,
  view: FloProposalView,
) => void;

export interface FloProposalCardProps {
  view: FloProposalView;
  onAction?: FloActionHandler;
  /**
   * Czy karta pokazuje godzinę u siebie. W wątku godzina stoi w lewej
   * kolumnie osi czasu (krok 4), więc karta ją tam oddaje; na dashboardzie
   * i w powiadomieniach nie ma osi, więc godzina wraca do karty.
   */
  showTime?: boolean;
  className?: string;
}

export function FloProposalCard(props: FloProposalCardProps) {
  switch (props.view.variant) {
    case 'info':
    case 'single':
    case 'preview':
    case 'choice':
    case 'list':
    case 'input':
      return <FloCardShell {...props} />;
  }
}

// ═══════════════════════════════════════════════════════════════
// Zegar karty
// ═══════════════════════════════════════════════════════════════

/**
 * Bieżąca chwila, ale dopiero PO zamontowaniu komponentu.
 *
 * Na serwerze i przy pierwszym renderze na kliencie zwraca `null`, więc
 * odliczanie po prostu jeszcze się nie rysuje. To nie jest ostrożność na
 * wyrost: gdyby czas brał się z `new Date()` w trakcie renderu, serwer
 * i przeglądarka policzyłyby go w dwóch różnych sekundach i React zgłosiłby
 * rozjazd hydratacji na każdej karcie.
 *
 * Częstotliwość dobrana do tego, co widać: przy terminie liczonym w minutach
 * napis zmienia się co sekundę, przy terminie za tydzień wystarczy minuta.
 */
function useNow(expiresAt: string): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();

    const target = Date.parse(expiresAt);
    const soon =
      !Number.isNaN(target) && target - Date.now() < 60 * 60 * 1000;

    const id = setInterval(tick, soon ? 1000 : 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return now;
}

// ═══════════════════════════════════════════════════════════════
// Wspólna skorupa karty
// ═══════════════════════════════════════════════════════════════

function FloCardShell({
  view,
  onAction,
  showTime = true,
  className,
}: FloProposalCardProps) {
  const now = useNow(view.expiresAt);
  const left = now ? timeLeft(view.expiresAt, now) : null;
  const expired = left?.expired ?? false;

  return (
    <article
      className={cn(
        'rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-3.5 transition-opacity',
        expired && 'opacity-60',
        className,
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        {showTime ? (
          <time
            dateTime={view.createdAt}
            className="text-xs tabular-nums text-[var(--ff-text-dim)]"
          >
            {clockLabel(view.createdAt)}
          </time>
        ) : (
          <span />
        )}

        {/* Odliczanie pojawia się po zamontowaniu — patrz `useNow`. */}
        {left ? (
          <span
            className={cn(
              'text-[11px] whitespace-nowrap',
              expired
                ? 'text-[var(--ff-text-faint)]'
                : 'text-[var(--ff-text-dim)]',
            )}
          >
            {left.label}
          </span>
        ) : null}
      </header>

      <h3 className="mt-1 text-sm font-semibold break-words text-[var(--ff-text-strong)]">
        {view.title}
      </h3>

      <p className="mt-1 text-sm break-words text-[var(--ff-text-soft)]">
        {view.body}
      </p>

      {expired ? (
        /* Spokojnie, bez czerwieni: minięty termin to normalny bieg rzeczy,
           nie awaria. Ta sama zasada co przy odpowiedzi `stale` z serwera. */
        <p className="mt-3 text-xs text-[var(--ff-text-muted)]">
          Termin tej sprawy minął. Jeśli nadal jest aktualna, wrócę do niej
          sam.
        </p>
      ) : (
        <FloCardActions view={view} onAction={onAction} />
      )}
    </article>
  );
}

// ═══════════════════════════════════════════════════════════════
// Przyciski
// ═══════════════════════════════════════════════════════════════

function FloCardActions({
  view,
  onAction,
}: {
  view: FloProposalView;
  onAction?: FloActionHandler;
}) {
  /**
   * Akcja promienia 4 jest zablokowana, dopóki człowiek nie obejrzy podglądu.
   * Sam podgląd dochodzi w kroku 7 — tutaj pilnujemy już samej blokady, żeby
   * nie dało się jej zgubić przy okazji budowania wariantów.
   */
  const needsPreviewFirst = view.primary.requiresPreview === true;
  const inert = onAction === undefined;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={inert || needsPreviewFirst}
        title={
          needsPreviewFirst
            ? 'Najpierw otwórz podgląd — zobacz, co dokładnie poleci'
            : undefined
        }
        onClick={() => onAction?.(view.primary, view)}
        className="rounded-lg bg-[var(--ff-cta-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ff-cta-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {view.primary.label}
      </button>

      {view.secondary.map((action) => (
        <button
          key={`${action.intent}:${action.label}`}
          type="button"
          disabled={inert}
          onClick={() => onAction?.(action, view)}
          className="rounded-lg border border-[var(--ff-border)] px-3 py-1.5 text-xs text-[var(--ff-text-muted)] transition-colors hover:border-[var(--ff-border-strong)] hover:text-[var(--ff-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
