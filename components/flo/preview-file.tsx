import type { FloPreview } from '@/types/flo';

type FilePreview = Extract<FloPreview, { type: 'file' }>;

/**
 * Podgląd pliku (krok 14 toru B) — nazwa, rozmiar, pobranie.
 *
 * Używany przez T-01 (gotowy JPK) i B-01 (paczka dla księgowej).
 *
 * LINK WYGASAJĄCY: adres bierzemy z ładunku przy każdym renderze i nigdzie
 * go nie zapamiętujemy — ani w stanie komponentu, ani w pamięci podręcznej
 * przeglądarki (`rel="noopener"` plus brak prefetchu; strona agenta jest
 * `force-dynamic`). Dzięki temu odświeżenie ekranu daje świeży adres, a nie
 * ten sprzed godziny. Gdyby mimo to trafił się adres po terminie, klient
 * zobaczy odpowiedź serwera, a nie ciszę — dlatego to zwykły odnośnik,
 * a nie pobieranie sterowane skryptem, które umiałoby połknąć błąd.
 *
 * Świadomie NIE dajemy atrybutu `download`: przy adresie podpisanym czasowo
 * przeglądarka potrafi zapisać plik o mylącej nazwie z adresu. Nazwę pliku
 * ustala serwer nagłówkiem, i tak jest uczciwiej.
 */
export function FloPreviewFile({ preview }: { preview: FilePreview }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        aria-hidden
        className="material-symbols-outlined text-[20px] text-[var(--ff-text-muted)]"
      >
        description
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-[var(--ff-text-strong)]">
          {preview.label}
        </p>
        <p className="text-[11px] text-[var(--ff-text-muted)]">
          {preview.sizeLabel}
        </p>
      </div>

      <a
        href={preview.href}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-[var(--ff-border)] px-3 py-1.5 text-xs text-[var(--ff-text-muted)] transition-colors hover:border-[var(--ff-border-strong)] hover:text-[var(--ff-text)]"
      >
        Pobierz
      </a>
    </div>
  );
}
