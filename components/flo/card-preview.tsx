'use client';

import { useState } from 'react';

import type { FloPreview } from '@/types/flo';

import { FloQuietButton } from './card-chrome';

/**
 * Podgląd w karcie — rozwijany panel z tym, co dokładnie poleci.
 *
 * TO JEST BEZPIECZNIK, NIE OZDOBA. Przy funkcjach promienia 4 (wysyłka do
 * KSeF, wiadomość do kontrahenta, paczka do księgowej) przycisk główny jest
 * zablokowany, dopóki ten panel nie zostanie otwarty. Dlatego otwarcie
 * melduje się na zewnątrz przez `onOpened` — to sygnał „człowiek zobaczył”,
 * a nie zdarzenie interfejsu.
 *
 * Zawartość jest na razie prosta i uczciwa: pokazuje wszystkie dane
 * z ładunku, w układzie właściwym dla rodzaju. Kroki 11–14 zamieniają każdy
 * z czterech rodzajów na dopracowany widok (faktura jak faktura, wiadomość
 * z edycją, różnica „było → jest”, plik do pobrania).
 */
export function FloPreviewPanel({
  preview,
  onOpened,
  openLabel = 'Pokaż podgląd',
  closeLabel = 'Ukryj podgląd',
}: {
  preview: FloPreview;
  /** wołane przy pierwszym otwarciu — odblokowuje akcję główną */
  onOpened?: () => void;
  openLabel?: string;
  closeLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <FloQuietButton
        label={open ? closeLabel : openLabel}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onOpened?.();
        }}
      />

      {open ? (
        <div className="mt-2 rounded-lg border border-[var(--ff-border)] bg-[var(--ff-surface-inset)] p-3 text-xs text-[var(--ff-text-soft)]">
          <FloPreviewBody preview={preview} />
        </div>
      ) : null}
    </div>
  );
}

function FloPreviewBody({ preview }: { preview: FloPreview }) {
  switch (preview.type) {
    case 'invoice':
      return (
        <div className="space-y-2">
          <ul className="space-y-1">
            {preview.lines.map((line) => (
              <li
                key={`${line.name}:${line.gross}`}
                className="flex flex-wrap justify-between gap-2"
              >
                <span className="min-w-0 break-words">
                  {line.name} · {line.qty}
                </span>
                <span className="tabular-nums whitespace-nowrap">
                  {line.gross}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-[var(--ff-border)] pt-2 font-medium text-[var(--ff-text-strong)]">
            <span>Do zapłaty</span>
            <span className="tabular-nums">{preview.total}</span>
          </div>
          <p className="text-[var(--ff-text-muted)]">Termin: {preview.due}</p>
        </div>
      );

    case 'message':
      return (
        <div className="space-y-1">
          <p className="text-[var(--ff-text-muted)]">Do: {preview.to}</p>
          <p className="font-medium text-[var(--ff-text-strong)]">
            {preview.subject}
          </p>
          {/* `whitespace-pre-line`, bo treść ma akapity i tak ją napisał
              silnik — nie sklejamy jej z powrotem w jeden blok. */}
          <p className="whitespace-pre-line">{preview.bodyText}</p>
        </div>
      );

    case 'diff':
      return (
        <ul className="space-y-1">
          {preview.rows.map((row) => (
            <li key={row.field} className="flex flex-wrap gap-x-2">
              <span className="text-[var(--ff-text-muted)]">{row.field}:</span>
              <span className="line-through opacity-70">{row.before}</span>
              <span aria-hidden>→</span>
              <span className="font-medium text-[var(--ff-text-strong)]">
                {row.after}
              </span>
            </li>
          ))}
        </ul>
      );

    case 'file':
      return (
        <a
          href={preview.href}
          className="inline-flex items-center gap-2 underline underline-offset-2 hover:text-[var(--ff-text)]"
        >
          {preview.label}
          <span className="text-[var(--ff-text-muted)]">
            ({preview.sizeLabel})
          </span>
        </a>
      );
  }
}
