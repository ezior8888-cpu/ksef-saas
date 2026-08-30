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
import { approveInputFor, EMPTY_CARD_STATE, primaryLock } from '../gating';

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
 *
 * EDYCJA TREŚCI (krok 12) mieszka tutaj, a nie w panelu podglądu: zwinięcie
 * podglądu odmontowuje pole tekstowe, więc gdyby treść siedziała w nim,
 * zniknęłaby razem z nim — a klient miałby prawo sądzić, że jego poprawka
 * została zapamiętana.
 */
export function FloPreviewCard({
  view,
  onAction,
  showTime,
  className,
  notice,
  pending,
  onUndo,
}: FloVariantProps) {
  const [previewSeen, setPreviewSeen] = useState(false);
  const [editedBody, setEditedBody] = useState<string | null>(null);
  const inert = onAction === undefined || pending === true;

  const state = { ...EMPTY_CARD_STATE, previewSeen, editedBody };
  const lock = primaryLock(view, state);

  return (
    <FloCardShell
      view={view}
      showTime={showTime}
      className={className}
      notice={notice}
      pending={pending}
      onUndo={onUndo}
    >
      {view.preview ? (
        <FloPreviewPanel
          preview={view.preview}
          onOpened={() => setPreviewSeen(true)}
          editedBody={editedBody ?? undefined}
          onEditBody={setEditedBody}
        />
      ) : null}

      <FloSecondaryRow view={view} onAction={onAction} disabled={inert}>
        <FloPrimaryButton
          label={view.primary.label}
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
