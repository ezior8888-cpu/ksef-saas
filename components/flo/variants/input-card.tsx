'use client';

import { useState } from 'react';

import {
  FloCardShell,
  FloLockNote,
  FloPrimaryButton,
  FloQuietButton,
  FloSecondaryRow,
  type FloVariantProps,
} from '../card-chrome';
import { FloPreviewPanel } from '../card-preview';
import { EMPTY_CARD_STATE, isValueValid, primaryLock } from '../gating';

/**
 * Wariant `input` (krok 10) — agent pyta o brakującą daną.
 *
 * Używany przez B-01 (adres e-mail księgowej przy paczce dokumentów) i K-02
 * (adres kontrahenta przy ponagleniu).
 *
 * EKRAN POTWIERDZENIA ADRESU: przy `inputKind: 'email'` samo wpisanie nie
 * wystarcza. Klient musi jeszcze zobaczyć zdanie „Wysyłam do anna@biuro.pl —
 * zgadza się?” i je potwierdzić. Powód jest prozaiczny i kosztowny:
 * literówka w adresie to komplet dokumentów firmy u zupełnie obcej osoby,
 * a tego nie cofnie żaden przycisk.
 *
 * Wartość idzie do serwera jako napis, bez czyszczenia poza obcięciem spacji.
 */
export function FloInputCard({
  view,
  onAction,
  showTime,
  className,
}: FloVariantProps) {
  const [value, setValue] = useState('');
  const [valueConfirmed, setValueConfirmed] = useState(false);
  const [previewSeen, setPreviewSeen] = useState(false);

  const inert = onAction === undefined;
  const kind = view.primary.inputKind;
  const trimmed = value.trim();
  const valueOk = isValueValid(value, kind);

  const lock = primaryLock(view, {
    ...EMPTY_CARD_STATE,
    value,
    valueConfirmed,
    previewSeen,
  });

  const needsConfirmation = kind === 'email';

  return (
    <FloCardShell view={view} showTime={showTime} className={className}>
      {view.preview ? (
        <FloPreviewPanel
          preview={view.preview}
          onOpened={() => setPreviewSeen(true)}
          openLabel="Pokaż, co jest w środku"
          closeLabel="Zwiń"
        />
      ) : null}

      <div className="mt-3">
        <label
          htmlFor={`flo-input-${view.id}`}
          className="block text-[11px] text-[var(--ff-text-muted)]"
        >
          {view.primary.inputLabel ?? 'Podaj wartość'}
        </label>
        <input
          id={`flo-input-${view.id}`}
          type={kind === 'email' ? 'email' : 'text'}
          inputMode={kind === 'amount' ? 'decimal' : undefined}
          value={value}
          disabled={valueConfirmed}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === 'email' ? 'anna@biuro.pl' : undefined}
          className="mt-1 w-full rounded-md border border-[var(--ff-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--ff-text)] placeholder:text-[var(--ff-text-faint)] focus:border-[var(--ff-border-strong)] focus:outline-none disabled:opacity-70"
        />
      </div>

      {needsConfirmation && valueOk ? (
        <div className="mt-2 rounded-lg border border-[var(--ff-border)] bg-[var(--ff-surface-inset)] p-2.5">
          {valueConfirmed ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs break-all text-[var(--ff-text-soft)]">
                Wysyłam do <strong>{trimmed}</strong>.
              </p>
              <FloQuietButton
                label="Popraw"
                onClick={() => setValueConfirmed(false)}
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs break-all text-[var(--ff-text-soft)]">
                Wysyłam do <strong>{trimmed}</strong> — zgadza się?
              </p>
              <FloQuietButton
                label="Tak, ten adres"
                onClick={() => setValueConfirmed(true)}
              />
            </div>
          )}
        </div>
      ) : null}

      <FloSecondaryRow view={view} onAction={onAction}>
        <FloPrimaryButton
          label={view.primary.label}
          disabled={inert || lock.locked}
          lockReason={lock.locked ? lock.reason : undefined}
          onClick={() => onAction?.(view.primary, view, { value: trimmed })}
        />
      </FloSecondaryRow>

      <FloLockNote reason={lock.locked ? lock.reason : undefined} />
    </FloCardShell>
  );
}
