'use client';

import { useCallback, useMemo, useState } from 'react';

import { FloQuietButton } from '../card-chrome';

import {
  buildShareSvg,
  shareSvgDataUrl,
  shareSvgToPngBlob,
} from './share-image';

/**
 * Próg pieniężny do zapisania (krok 38 toru B).
 *
 * JEDNO ZDANIE I OBRAZ. Bez odznak, bez pasków postępu, bez liczników faktur
 * i bez fanfar — klient sam wie, czy sto tysięcy to dużo. Karta z progiem ma
 * wyglądać dorośle, więc jedyne, co dokładamy, to możliwość zapisania obrazka.
 *
 * Zapis jest ZABLOKOWANY do czasu obejrzenia podglądu — ta sama zasada, co
 * przy wysyłce: nie zapisujemy w ciemno czegoś, co zaraz trafi do sieci.
 */
export function FloMilestoneShare({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const svg = useMemo(
    () =>
      buildShareSvg({
        value: title,
        caption: body,
        footer: 'FaktFlow',
      }),
    [title, body],
  );

  const save = useCallback(async () => {
    try {
      const blob = await shareSvgToPngBlob(svg);
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'faktflow-prog.png';
      link.click();

      URL.revokeObjectURL(url);
      setNote('Zapisane. Plik jest w Pobranych.');
    } catch {
      setNote('Nie udało mi się zapisać obrazu. Zrzut ekranu też zadziała.');
    }
  }, [svg]);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <FloQuietButton
          label={open ? 'Ukryj obraz' : 'Pokaż obraz do zapisania'}
          onClick={() => setOpen(!open)}
        />
        <FloQuietButton
          label="Zapisz obraz"
          disabled={!open}
          onClick={() => void save()}
        />
      </div>

      {open ? (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shareSvgDataUrl(svg)}
            alt={`Podgląd obrazu: ${title}`}
            className="w-32 rounded-lg border border-[var(--ff-border)]"
          />
          <p className="mt-1.5 text-[11px] text-[var(--ff-text-muted)]">
            Dokładnie to znajdzie się w pliku.
          </p>
        </div>
      ) : null}

      {note ? (
        <p role="status" className="mt-2 text-[11px] text-[var(--ff-text-soft)]">
          {note}
        </p>
      ) : null}
    </div>
  );
}
