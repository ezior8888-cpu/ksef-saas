'use client';

import { useState } from 'react';

import type { FloPreview } from '@/types/flo';

import { FloQuietButton } from './card-chrome';
import { FloPreviewDiff } from './preview-diff';
import { FloPreviewFile } from './preview-file';
import { FloPreviewInvoice } from './preview-invoice';
import { FloPreviewMessage } from './preview-message';

/**
 * Podgląd w karcie — rozwijany panel z tym, co dokładnie poleci.
 *
 * TO JEST BEZPIECZNIK, NIE OZDOBA. Przy funkcjach promienia 4 (wysyłka do
 * KSeF, wiadomość do kontrahenta, paczka do księgowej) przycisk główny jest
 * zablokowany, dopóki ten panel nie zostanie otwarty. Dlatego otwarcie
 * melduje się na zewnątrz przez `onOpened` — to sygnał „człowiek zobaczył”,
 * a nie zdarzenie interfejsu.
 *
 * Zawartość rozgałęzia się na cztery komponenty (kroki 11–14). Rozgałęzienie
 * jest jawne, bez `default`: piąty rodzaj podglądu ma zatrzymać kompilację,
 * a nie wylądować u klienta jako pusty prostokąt.
 */
export function FloPreviewPanel({
  preview,
  onOpened,
  editedBody,
  onEditBody,
  openLabel = 'Pokaż podgląd',
  closeLabel = 'Ukryj podgląd',
}: {
  preview: FloPreview;
  /** wołane przy pierwszym otwarciu — odblokowuje akcję główną */
  onOpened?: () => void;
  /** treść wiadomości po edycji — trzymana przez kartę, nie przez panel */
  editedBody?: string;
  onEditBody?: (next: string) => void;
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
          <FloPreviewBody
            preview={preview}
            editedBody={editedBody}
            onEditBody={onEditBody}
          />
        </div>
      ) : null}
    </div>
  );
}

function FloPreviewBody({
  preview,
  editedBody,
  onEditBody,
}: {
  preview: FloPreview;
  editedBody?: string;
  onEditBody?: (next: string) => void;
}) {
  switch (preview.type) {
    case 'invoice':
      return <FloPreviewInvoice preview={preview} />;
    case 'message':
      return (
        <FloPreviewMessage
          preview={preview}
          value={editedBody}
          onChange={onEditBody}
        />
      );
    case 'diff':
      return <FloPreviewDiff preview={preview} />;
    case 'file':
      return <FloPreviewFile preview={preview} />;
  }
}
