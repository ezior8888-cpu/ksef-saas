'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { screenForDisplay, type WrappedResult } from '@/lib/flo/wrapped';

import {
  buildShareSvg,
  shareSvgDataUrl,
  shareSvgToPngBlob,
} from './share-image';

/**
 * FaktFlow Wrapped (krok 37 toru B) — siedem ekranów przewijanych palcem.
 *
 * TO JEDYNE MIEJSCE W PRODUKCIE, GDZIE WOLNO PRZESADZIĆ Z ANIMACJĄ. Wszędzie
 * indziej agent jest rzeczowy; tutaj ma prawo się pochwalić. Ale i tu obowiązują
 * trzy rzeczy, których nie wolno złamać:
 *
 * 1. WYJŚCIE NA PIERWSZYM EKRANIE. Dla firmy po słabym roku podsumowanie jest
 *    przykrością, nie zabawą — „nie chcę tego oglądać” musi być widoczne, zanim
 *    padnie pierwsza liczba.
 * 2. NAZWY KONTRAHENTÓW ZASŁONIĘTE DOMYŚLNIE. Ten obraz ląduje w mediach
 *    społecznościowych, a klient nie pytał nikogo o zgodę na pokazanie, ile
 *    u niego wydał.
 * 3. PODGLĄD PRZED ZAPISEM. Klient widzi dokładnie ten obraz, który za chwilę
 *    trafi do galerii — łącznie z tym, czy widać na nim kwoty i nazwy.
 *
 * Animacja jest tylko przejściem między ekranami i respektuje
 * `prefers-reduced-motion`. Zapis obrazu nie zależy od niej w ogóle: powstaje
 * z opisu SVG, nie ze zrzutu ekranu.
 */

export function FloWrappedDeck({
  masked,
  revealed,
}: {
  /** Wersja z zasłoniętymi nazwami — domyślna. */
  masked: WrappedResult;
  /** Ta sama treść z prawdziwymi nazwami; pokazywana tylko na żądanie. */
  revealed: WrappedResult;
}) {
  const [index, setIndex] = useState(0);
  const [showNames, setShowNames] = useState(false);
  const [showAmounts, setShowAmounts] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const result = showNames ? revealed : masked;
  const screens = result.screens;
  const screen = screens[index] ?? screens[0];

  // Wersję do pokazania składa SILNIK, nie ten komponent. Lista „ekranów
  // z pieniędzmi” trzymana tutaj rozjeżdżała się z treścią: zasłaniała samą
  // liczbę, a kwoty w podpisach („48 200,00 zł w jednym miesiącu”) szły do
  // pliku mimo wyłączonego przełącznika.
  const shown = screen
    ? screenForDisplay(screen, { showAmounts })
    : { label: '', value: '', caption: '' };

  const svg = useMemo(() => {
    if (!screen) return '';
    return buildShareSvg({
      label: shown.label,
      value: shown.value,
      caption: shown.caption,
      footer: `FaktFlow · ${result.year}`,
    });
  }, [screen, shown.label, shown.value, shown.caption, result.year]);

  // Bez `useCallback`: kompilator Reacta zapamiętuje to sam, a ręczna lista
  // zależności z `screen?.key` była węższa niż wywnioskowana i blokowała mu
  // optymalizację całego komponentu.
  async function save() {
    try {
      const blob = await shareSvgToPngBlob(svg);
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `faktflow-${result.year}-${screen?.key ?? 'podsumowanie'}.png`;
      link.click();

      URL.revokeObjectURL(url);
      setSaveNote('Zapisane. Plik jest w Pobranych.');
    } catch {
      setSaveNote(
        'Nie udało mi się zapisać obrazu. Zrzut ekranu też zadziała — nic nie tracisz.',
      );
    }
  }

  if (!screen) {
    return (
      <p className="text-sm text-[var(--ff-text-muted)]">
        Za ten rok nie mam jeszcze z czego zrobić podsumowania.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-[var(--ff-text-strong)]">
          Twój {result.year} w liczbach
        </h1>

        {/* Wyjście jest przy pierwszej liczbie, nie na końcu sekwencji. */}
        <Link
          href="/dashboard"
          className="ml-auto rounded-lg border border-[var(--ff-border)] px-3 py-1.5 text-xs text-[var(--ff-text-muted)] transition-colors hover:border-[var(--ff-border-strong)] hover:text-[var(--ff-text)]"
        >
          Nie chcę tego oglądać
        </Link>
      </header>

      <section
        aria-live="polite"
        className="relative flex min-h-[420px] flex-1 flex-col items-center justify-center rounded-3xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-8 text-center"
      >
        <p className="text-[11px] tracking-[0.18em] text-[var(--ff-text-muted)] uppercase">
          {shown.label}
        </p>

        <p
          key={`${screen.key}:${shown.value}`}
          className="mt-4 text-5xl font-bold tabular-nums text-[var(--ff-text-strong)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
        >
          {shown.value}
        </p>

        <p className="mt-4 max-w-sm text-sm text-[var(--ff-text-soft)]">
          {shown.caption}
        </p>
      </section>

      <nav className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="min-h-9 rounded-lg border border-[var(--ff-border)] px-3 py-1.5 text-xs text-[var(--ff-text-muted)] transition-colors hover:text-[var(--ff-text)] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--ff-accent)] focus-visible:outline-none"
        >
          Wstecz
        </button>

        <ol className="flex items-center gap-1.5" aria-label="Postęp">
          {screens.map((item, position) => (
            <li key={item.key}>
              <button
                type="button"
                aria-label={`Ekran ${position + 1}: ${item.label}`}
                aria-current={position === index}
                onClick={() => setIndex(position)}
                className={cn(
                  'size-2.5 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ff-accent)] focus-visible:outline-none',
                  position === index
                    ? 'bg-[var(--ff-accent)]'
                    : 'bg-[var(--ff-border-strong)]',
                )}
              />
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={() => setIndex(Math.min(screens.length - 1, index + 1))}
          disabled={index === screens.length - 1}
          className="min-h-9 rounded-lg border border-[var(--ff-border)] px-3 py-1.5 text-xs text-[var(--ff-text-muted)] transition-colors hover:text-[var(--ff-text)] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--ff-accent)] focus-visible:outline-none"
        >
          Dalej
        </button>
      </nav>

      <section className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4">
        <h2 className="text-xs font-medium text-[var(--ff-text)]">
          Zanim to zapiszesz
        </h2>

        <div className="mt-3 space-y-2.5">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={showNames}
              onChange={(e) => setShowNames(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--ff-accent)]"
            />
            <span className="text-xs text-[var(--ff-text-soft)]">
              Pokaż prawdziwe nazwy kontrahentów
              <span className="block text-[11px] text-[var(--ff-text-muted)]">
                Domyślnie zasłonięte. Twój klient nie zgadzał się na to, żeby
                jego nazwa trafiła do sieci.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={showAmounts}
              onChange={(e) => setShowAmounts(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--ff-accent)]"
            />
            <span className="text-xs text-[var(--ff-text-soft)]">
              Pokaż kwoty
              <span className="block text-[11px] text-[var(--ff-text-muted)]">
                Wyłącz, jeśli chcesz pochwalić się rokiem bez pokazywania,
                ile zarabiasz.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(!previewOpen)}
            className="min-h-9 rounded-lg bg-[var(--ff-cta-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ff-cta-fg)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ff-accent)] focus-visible:outline-none"
          >
            {previewOpen ? 'Ukryj podgląd' : 'Pokaż, co się zapisze'}
          </button>

          {/* Zapis jest ZABLOKOWANY do czasu obejrzenia podglądu — ta sama
              zasada, co przy wysyłce: nie zapisujemy w ciemno czegoś, co
              zaraz trafi do sieci. */}
          <button
            type="button"
            onClick={() => void save()}
            disabled={!previewOpen}
            title={previewOpen ? undefined : 'Najpierw zobacz, co się zapisze'}
            className="min-h-9 rounded-lg border border-[var(--ff-border)] px-3 py-1.5 text-xs text-[var(--ff-text-muted)] transition-colors hover:text-[var(--ff-text)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--ff-accent)] focus-visible:outline-none"
          >
            Zapisz obraz
          </button>
        </div>

        {previewOpen ? (
          <div className="mt-3">
            {/* Podgląd rysuje TEN SAM napis SVG, który idzie na płótno —
                dlatego nie da się zapisać czegoś innego, niż widać. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shareSvgDataUrl(svg)}
              alt={`Podgląd obrazu: ${shown.label}, ${shown.value}`}
              className="mx-auto w-40 rounded-xl border border-[var(--ff-border)]"
            />
            <p className="mt-2 text-center text-[11px] text-[var(--ff-text-muted)]">
              Dokładnie to znajdzie się w pliku.
            </p>
          </div>
        ) : null}

        {saveNote ? (
          <p role="status" className="mt-3 text-[11px] text-[var(--ff-text-soft)]">
            {saveNote}
          </p>
        ) : null}
      </section>
    </div>
  );
}
