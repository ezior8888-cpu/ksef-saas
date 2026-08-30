'use client';

import { useState } from 'react';

import {
  FloCardShell,
  FloLockNote,
  FloPrimaryButton,
  FloSecondaryRow,
  type FloVariantProps,
} from '../card-chrome';
import { FloPreviewPanel } from '../card-preview';
import { EMPTY_CARD_STATE, primaryLock } from '../gating';

/**
 * Wariant `preview` (krok 7) — NAJWAŻNIEJSZY WARIANT W CAŁYM INTERFEJSIE.
 *
 * Tędy przechodzą wszystkie funkcje promienia 4: wysyłka faktury do KSeF,
 * wiadomość do kontrahenta, propozycja podwyżki, poprawka po odrzuceniu,
 * paczka do księgowej. Wspólna cecha: pomyłki nie da się cofnąć, bo dokument
 * jest już w rejestrze państwowym albo wiadomość u obcej osoby.
 *
 * ZASADA: przycisk główny jest ZABLOKOWANY, dopóki człowiek nie otworzy
 * podglądu. Nie „powinien być” — jest, i pilnuje tego czysta funkcja
 * `primaryLock` z osobnego pliku, żeby nie dało się jej zgubić przy zmianie
 * wyglądu. Raz obejrzany podgląd zostaje obejrzany; zamknięcie panelu nie
 * zamyka z powrotem przycisku, bo człowiek już wie, co zatwierdza.
 *
 * Etykiety przycisku NIE ZMIENIAMY. Serwer przysyła gotową („Wyślij
 * wiadomość”, a przy P-04 „Pokaż treść”) i to on wie, co jest na końcu tej
 * drogi.
 */
export function FloPreviewCard({
  view,
  onAction,
  showTime,
  className,
}: FloVariantProps) {
  const [previewSeen, setPreviewSeen] = useState(false);
  const inert = onAction === undefined;

  const lock = primaryLock(view, { ...EMPTY_CARD_STATE, previewSeen });

  return (
    <FloCardShell view={view} showTime={showTime} className={className}>
      {view.preview ? (
        <FloPreviewPanel
          preview={view.preview}
          onOpened={() => setPreviewSeen(true)}
        />
      ) : null}

      <FloSecondaryRow view={view} onAction={onAction}>
        <FloPrimaryButton
          label={view.primary.label}
          disabled={inert || lock.locked}
          lockReason={lock.locked ? lock.reason : undefined}
          onClick={() => onAction?.(view.primary, view)}
        />
      </FloSecondaryRow>

      <FloLockNote reason={lock.locked ? lock.reason : undefined} />
    </FloCardShell>
  );
}
