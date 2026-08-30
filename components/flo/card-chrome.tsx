'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import type { FloAction, FloApproveInput, FloProposalView } from '@/types/flo';

import { FloEvidenceDisclosure } from './evidence';
import { clockLabel, timeLeft } from './format';
import { FloUndoBar } from './undo-bar';

/**
 * Wspólna skorupa karty i jej przyciski — to, co mają wszystkie sześć
 * wariantów (kroki 5–10 toru B).
 *
 * Warianty różnią się WYŁĄCZNIE tym, co dzieje się między treścią a
 * przyciskiem głównym. Nagłówek, tytuł, treść, odliczanie i zachowanie po
 * wygaśnięciu są tutaj, raz.
 */

/** Co karta robi po kliknięciu. Brak = przyciski są nieczynne. */
export type FloActionHandler = (
  action: FloAction,
  view: FloProposalView,
  input?: FloApproveInput,
) => void;

export interface FloVariantProps {
  view: FloProposalView;
  onAction?: FloActionHandler;
  showTime?: boolean;
  className?: string;
  /**
   * Spokojne zdanie od serwera: „Nowak zapłacił wczoraj — anulowałem”.
   * Odmowa wykonania (`stale`, `expired`, `blocked`) NIE JEST awarią, więc
   * nie ma tu miejsca na czerwień ani na słowo „błąd” (krok 19).
   */
  notice?: string;
  /** true = trwa wykonywanie; przyciski tej karty są chwilowo nieczynne */
  pending?: boolean;
  /** cofnięcie czynności, którą agent wykonał sam (krok 18) */
  onUndo?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// Zegar karty
// ═══════════════════════════════════════════════════════════════

/**
 * Bieżąca chwila, ale dopiero PO zamontowaniu komponentu.
 *
 * Na serwerze i przy pierwszym renderze na kliencie zwraca `null`, więc
 * odliczanie po prostu jeszcze się nie rysuje. Gdyby czas brał się z
 * `new Date()` w trakcie renderu, serwer i przeglądarka policzyłyby go
 * w dwóch różnych sekundach i React zgłosiłby rozjazd hydratacji na każdej
 * karcie.
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
    const soon = !Number.isNaN(target) && target - Date.now() < 60 * 60 * 1000;

    const id = setInterval(tick, soon ? 1000 : 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return now;
}

// ═══════════════════════════════════════════════════════════════
// Skorupa
// ═══════════════════════════════════════════════════════════════

export function FloCardShell({
  view,
  showTime = true,
  className,
  notice,
  pending,
  onUndo,
  children,
}: {
  view: FloProposalView;
  showTime?: boolean;
  className?: string;
  notice?: string;
  pending?: boolean;
  onUndo?: () => void;
  /** wnętrze wariantu: pola, lista, podgląd i przyciski */
  children: React.ReactNode;
}) {
  const now = useNow(view.expiresAt);
  const left = now ? timeLeft(view.expiresAt, now) : null;
  const expired = left?.expired ?? false;

  return (
    <article
      data-variant={view.variant}
      className={cn(
        'rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-3.5 transition-opacity',
        expired && 'opacity-60',
        className,
      )}
    >
      {view.undoableUntil ? (
        <FloUndoBar
          until={view.undoableUntil}
          onUndo={onUndo}
          disabled={pending || onUndo === undefined}
        />
      ) : null}

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
        children
      )}

      <FloEvidenceDisclosure evidence={view.evidence} />

      {notice ? (
        /* Odpowiedź serwera „nie wykonałem, bo dane się zmieniły” to dobra
           wiadomość: bezpiecznik zadziałał. Ton ma to oddawać — spokojny
           komunikat, nigdy czerwony pasek awarii. */
        <p
          role="status"
          className="mt-3 rounded-lg border border-[var(--ff-border)] bg-[var(--ff-surface-inset)] p-2.5 text-xs text-[var(--ff-text-soft)]"
        >
          {notice}
        </p>
      ) : null}
    </article>
  );
}

// ═══════════════════════════════════════════════════════════════
// Przyciski
// ═══════════════════════════════════════════════════════════════

/** Główna akcja karty. Jedna na kartę, zawsze widoczna, nigdy ukryta. */
export function FloPrimaryButton({
  label,
  onClick,
  disabled,
  lockReason,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** powód blokady — napis dla człowieka, trafia na `title` i pod przycisk */
  lockReason?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={lockReason}
      onClick={onClick}
      className="min-h-9 rounded-lg bg-[var(--ff-cta-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ff-cta-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

/** Wszystko poza akcją główną: „nie teraz”, „nigdy więcej”, „pokaż”. */
export function FloQuietButton({
  label,
  onClick,
  disabled,
  className,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-9 rounded-lg border border-[var(--ff-border)] px-3 py-1.5 text-xs text-[var(--ff-text-muted)] transition-colors hover:border-[var(--ff-border-strong)] hover:text-[var(--ff-text)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {label}
    </button>
  );
}

/**
 * Rząd akcji drugorzędnych („nie teraz”, „nigdy więcej takich”).
 *
 * Świadomie dyskretne: mają być łatwe do znalezienia, gdy klient ich szuka,
 * i niewidoczne, gdy szuka głównej. Odmowa nie jest karą — dwa odrzucenia
 * tego samego rodzaju wyciszają go na 90 dni po stronie silnika.
 */
export function FloSecondaryRow({
  view,
  onAction,
  disabled,
  children,
}: {
  view: FloProposalView;
  onAction?: FloActionHandler;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {children}
      {view.secondary.map((action) => (
        <FloQuietButton
          key={`${action.intent}:${action.label}`}
          label={action.label}
          disabled={disabled ?? onAction === undefined}
          onClick={() => onAction?.(action, view)}
        />
      ))}
    </div>
  );
}

/** Powód blokady napisany pod przyciskiem — nie tylko w dymku. */
export function FloLockNote({ reason }: { reason?: string }) {
  if (!reason) return null;

  return (
    <p className="mt-2 text-[11px] text-[var(--ff-text-faint)]">{reason}</p>
  );
}
