'use client';

import type { FloPreview } from '@/types/flo';

type MessagePreview = Extract<FloPreview, { type: 'message' }>;

/**
 * Podgląd wiadomości z edycją (krok 12 toru B).
 *
 * To jest jedyny podgląd, w którym klient może COŚ ZMIENIĆ przed wysłaniem —
 * i dlatego jest tu najostrożniej. Treść po edycji wraca do karty, karta
 * przekazuje ją do akcji zatwierdzającej, a serwer wysyła DOKŁADNIE TO, co
 * człowiek widział w polu. Nie „mniej więcej to”: żadnego doklejania stopki
 * ani poprawiania interpunkcji po drodze.
 *
 * Wartość jest sterowana z góry (`value` + `onChange`), a nie trzymana tutaj.
 * Gdyby siedziała w tym komponencie, zwinięcie podglądu skasowałoby edycję
 * razem z odmontowaniem pola — a klient miałby prawo sądzić, że jego zmiana
 * została zapamiętana.
 *
 * CZEGO NIE MA: trzech wariantów tonu jako zakładek. Plan je przewiduje
 * „gdy serwer je przyśle”, a kontrakt (`FloPreview`) nie ma na nie miejsca.
 * Nie wymyślam pola za silnik — zapisane w dzienniku.
 */
export function FloPreviewMessage({
  preview,
  value,
  onChange,
}: {
  preview: MessagePreview;
  /** treść po edycji; gdy `undefined`, pokazujemy tę z serwera */
  value?: string;
  onChange?: (next: string) => void;
}) {
  const text = value ?? preview.bodyText;
  const edited = text !== preview.bodyText;

  return (
    <div className="space-y-2">
      <dl className="space-y-0.5">
        <div className="flex gap-2">
          <dt className="text-[var(--ff-text-muted)]">Do:</dt>
          <dd className="min-w-0 break-all">{preview.to}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[var(--ff-text-muted)]">Temat:</dt>
          <dd className="min-w-0 font-medium break-words text-[var(--ff-text-strong)]">
            {preview.subject}
          </dd>
        </div>
      </dl>

      <div>
        <label htmlFor={`flo-msg-${preview.to}`} className="sr-only">
          Treść wiadomości
        </label>
        <textarea
          id={`flo-msg-${preview.to}`}
          value={text}
          readOnly={!onChange}
          onChange={(e) => onChange?.(e.target.value)}
          rows={8}
          className="w-full resize-y rounded-md border border-[var(--ff-border)] bg-[var(--ff-surface)] p-2 text-[11px] leading-relaxed text-[var(--ff-text-soft)] focus:border-[var(--ff-border-strong)] focus:outline-none"
        />
      </div>

      <p className="text-[11px] text-[var(--ff-text-faint)]">
        {edited
          ? 'Wyślę dokładnie tę treść, po Twoich zmianach.'
          : 'Możesz poprawić treść — wyślę to, co tu zostanie.'}
      </p>
    </div>
  );
}
