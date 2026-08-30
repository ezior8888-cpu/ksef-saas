'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';
import type { FloListItem } from '@/types/flo';

import {
  FloCardShell,
  FloLockNote,
  FloPrimaryButton,
  FloQuietButton,
  FloSecondaryRow,
  type FloVariantProps,
} from '../card-chrome';
import { countLabel, FLO_FORMS } from '../format';
import {
  approveInputFor,
  canSelectItem,
  EMPTY_CARD_STATE,
  primaryLock,
} from '../gating';

/**
 * Wariant `list` (krok 9) — paczka pozycji z zaznaczaniem.
 *
 * Używany przez P-02 (dziesięć faktur pierwszego dnia miesiąca) i X-05
 * (audyt porządku w dokumentach). To najcięższa karta w produkcie: jedno
 * kliknięcie wysyła kilkanaście dokumentów do rejestru państwowego.
 *
 * BEZPIECZNIK: pozycja odstająca przychodzi z serwera odznaczona
 * (`preselected: false`) i z żądaniem obejrzenia (`needsPreview: true`).
 * Do czasu rozwinięcia jej wiersza NIE DA SIĘ jej zaznaczyć — pole wyboru
 * jest wyłączone. Silnik pilnuje tego po swojej stronie, interfejs po swojej;
 * między klientem a hurtową wysyłką faktury na złą kwotę mają stać dwie
 * niezależne blokady, nie jedna.
 *
 * CZEGO TU NIE MA: sumy zaznaczonych kwot. Plan ją przewiduje, ale kontrakt
 * przysyła kwoty jako gotowe napisy, a interfejsowi nie wolno liczyć — od
 * dodawania pieniędzy jest serwer. Zamiast sumy pokazujemy liczbę pozycji.
 * Rozwiązanie docelowe wymaga pola od silnika; zapisane w dzienniku.
 */
export function FloListCard({
  view,
  onAction,
  showTime,
  className,
  notice,
  pending,
  onUndo,
}: FloVariantProps) {
  const items = view.items ?? [];

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    items.filter((item) => item.preselected).map((item) => item.id),
  );
  const [seenItemIds, setSeenItemIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const inert = onAction === undefined || pending === true;
  const state = { ...EMPTY_CARD_STATE, selectedIds, seenItemIds };
  const lock = primaryLock(view, state);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    );
  };

  const reveal = (id: string) => {
    setOpenId(openId === id ? null : id);
    setSeenItemIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
  };

  return (
    <FloCardShell
      view={view}
      showTime={showTime}
      className={className}
      notice={notice}
      pending={pending}
      onUndo={onUndo}
    >
      <ul className="mt-3 space-y-1">
        {items.map((item) => (
          <FloListRow
            key={item.id}
            item={item}
            checked={selectedIds.includes(item.id)}
            selectable={canSelectItem(item, state)}
            open={openId === item.id}
            onToggle={() => toggleSelected(item.id)}
            onReveal={() => reveal(item.id)}
          />
        ))}
      </ul>

      <p className="mt-2 text-[11px] text-[var(--ff-text-muted)]">
        Zaznaczone: {countLabel(selectedIds.length, FLO_FORMS.pozycja)}
        {' z '}
        {items.length}
      </p>

      <FloSecondaryRow view={view} onAction={onAction} disabled={inert}>
        <FloPrimaryButton
          /* Słowa są serwera, liczba nasza: „Wyślij zaznaczone · 4 pozycje”.
             Etykiety z `primary.label` nie przepisujemy — serwer wie, co jest
             na końcu tej drogi. */
          label={`${view.primary.label} · ${countLabel(
            selectedIds.length,
            FLO_FORMS.pozycja,
          )}`}
          disabled={inert || lock.locked}
          lockReason={lock.locked ? lock.reason : undefined}
          onClick={() =>
            onAction?.(view.primary, view, approveInputFor(view, state))
          }
        />
      </FloSecondaryRow>

      <FloLockNote reason={lock.locked ? lock.reason : undefined} />
    </FloCardShell>
  );
}

function FloListRow({
  item,
  checked,
  selectable,
  open,
  onToggle,
  onReveal,
}: {
  item: FloListItem;
  checked: boolean;
  selectable: boolean;
  open: boolean;
  onToggle: () => void;
  onReveal: () => void;
}) {
  return (
    <li
      className={cn(
        'rounded-lg border border-transparent px-2 py-1.5 transition-colors',
        !selectable && 'opacity-60',
        checked && 'border-[var(--ff-border)] bg-[var(--ff-surface-inset)]',
      )}
    >
      <div className="flex items-center gap-2.5">
        <input
          id={`flo-item-${item.id}`}
          type="checkbox"
          checked={checked}
          disabled={!selectable}
          onChange={onToggle}
          className="size-4 shrink-0 accent-[var(--ff-accent)] disabled:cursor-not-allowed"
        />

        <label
          htmlFor={`flo-item-${item.id}`}
          className="min-w-0 flex-1 cursor-pointer"
        >
          <span className="block truncate text-xs font-medium text-[var(--ff-text)]">
            {item.label}
          </span>
          <span className="block truncate text-[11px] text-[var(--ff-text-muted)]">
            {item.sublabel}
          </span>
        </label>

        <span className="shrink-0 text-xs tabular-nums text-[var(--ff-text-soft)]">
          {item.amount}
        </span>

        {item.needsPreview ? (
          <FloQuietButton
            label={open ? 'Zwiń' : 'Pokaż'}
            onClick={onReveal}
            className="shrink-0 px-2 py-1"
          />
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 ml-6 rounded-md border border-[var(--ff-border)] bg-[var(--ff-surface-inset)] p-2 text-[11px] text-[var(--ff-text-soft)]">
          <p className="break-words">{item.label}</p>
          <p className="break-words text-[var(--ff-text-muted)]">
            {item.sublabel}
          </p>
          <p className="mt-1 tabular-nums">{item.amount}</p>
          <p className="mt-1 text-[var(--ff-text-faint)]">
            Ta pozycja odbiega od tego, co zwykle wystawiasz — dlatego pytam
            o nią osobno.
          </p>
        </div>
      ) : null}
    </li>
  );
}
