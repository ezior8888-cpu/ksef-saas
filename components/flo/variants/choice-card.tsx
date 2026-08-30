'use client';

import { useState } from 'react';

import type { FloAction } from '@/types/flo';

import {
  FloCardShell,
  FloPrimaryButton,
  FloQuietButton,
  type FloVariantProps,
} from '../card-chrome';
import { isValueValid } from '../gating';

/**
 * Wariant `choice` (krok 8) — wybór jednej z kilku odpowiedzi.
 *
 * Używany przez K-01 („zapłacił? tak / jeszcze nie / częściowo”), W-03
 * („zawsze tak księguj / pytaj za każdym razem”), P-03 („wystaw / wystawiona
 * gdzie indziej / skończyliśmy współpracę”).
 *
 * Trzecia opcja bywa pytaniem o liczbę — wtedy nie jest to osobna karta ani
 * osobny ekran, tylko pole, które rozwija się w miejscu. Klient odpowiada na
 * pytanie tam, gdzie je przeczytał.
 *
 * Kwota wpisana przez człowieka jedzie do serwera JAKO NAPIS, dokładnie tak,
 * jak ją wpisał. Interfejs sprawdza tylko kształt („1 234,56”), nie przelicza
 * i nie zaokrągla — od liczenia jest silnik.
 */
export function FloChoiceCard({
  view,
  onAction,
  showTime,
  className,
}: FloVariantProps) {
  const [openInput, setOpenInput] = useState<FloAction | null>(null);
  const [value, setValue] = useState('');
  const inert = onAction === undefined;

  const valueOk = openInput
    ? isValueValid(value, openInput.inputKind)
    : false;

  return (
    <FloCardShell view={view} showTime={showTime} className={className}>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FloPrimaryButton
          label={view.primary.label}
          disabled={inert}
          onClick={() => onAction?.(view.primary, view)}
        />

        {view.secondary.map((action) =>
          action.intent === 'input' ? (
            <FloQuietButton
              key={`${action.intent}:${action.label}`}
              label={action.label}
              onClick={() => {
                setOpenInput(openInput === action ? null : action);
                setValue('');
              }}
            />
          ) : (
            <FloQuietButton
              key={`${action.intent}:${action.label}`}
              label={action.label}
              disabled={inert}
              onClick={() => onAction?.(action, view)}
            />
          ),
        )}
      </div>

      {openInput ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-[var(--ff-border)] bg-[var(--ff-surface-inset)] p-3">
          <div className="min-w-0 flex-1">
            <label
              htmlFor={`flo-choice-${view.id}`}
              className="block text-[11px] text-[var(--ff-text-muted)]"
            >
              {openInput.inputLabel ?? 'Podaj wartość'}
            </label>
            <input
              id={`flo-choice-${view.id}`}
              type="text"
              inputMode={openInput.inputKind === 'amount' ? 'decimal' : 'text'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                openInput.inputKind === 'amount' ? '1 234,56' : undefined
              }
              className="mt-1 w-full rounded-md border border-[var(--ff-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--ff-text)] placeholder:text-[var(--ff-text-faint)] focus:border-[var(--ff-border-strong)] focus:outline-none"
            />
          </div>

          <FloPrimaryButton
            label="Zapisz"
            disabled={inert || !valueOk}
            lockReason={
              valueOk ? undefined : 'Wpisz kwotę, np. 1 234,56'
            }
            onClick={() => onAction?.(openInput, view, { value: value.trim() })}
          />
        </div>
      ) : null}
    </FloCardShell>
  );
}
