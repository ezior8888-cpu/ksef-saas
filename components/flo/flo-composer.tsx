/**
 * Pole rozmowy z agentem — pas z makiety: tekst, mikrofon, aparat.
 *
 * WSZYSTKO JEST WYŁĄCZONE I MÓWI O TYM WPROST. Ekran bez tego pasa kłamałby
 * o tym, czym FLO ma być: nie tylko strumieniem propozycji, ale też kimś, do
 * kogo można się odezwać. Pas, który przyjmuje tekst i wyrzuca go do kosza,
 * kłamałby mocniej. Rozmowa (O-04) i ścieżka paragonu z telefonu wchodzą
 * osobnymi krokami — wtedy te trzy elementy ożywają.
 *
 * WRZESIEŃ 2026: przycisk mikrofonu i aparatu dostały okrągłą obwódkę
 * z makiety telefonu i rozmiar 44 px na ekranach dotykowych. To jest zmiana
 * WYŁĄCZNIE w klasach — nadal `disabled`, nadal z uczciwą etykietą
 * „(jeszcze nieczynne)”. Wygląd gotowy przed działaniem jest w porządku;
 * działanie udawane nie byłoby.
 */
export function FloComposer() {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] px-3 py-2.5">
      <label htmlFor="flo-composer" className="sr-only">
        Napisz do Flo
      </label>
      <input
        id="flo-composer"
        type="text"
        disabled
        placeholder="Napisz do Flo… (jeszcze nieczynne)"
        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ff-text)] placeholder:text-[var(--ff-text-muted)] focus:outline-none disabled:cursor-not-allowed"
      />

      <FloComposerButton icon="mic" label="Nagraj wiadomość" />
      <FloComposerButton icon="photo_camera" label="Zrób zdjęcie paragonu" />
    </div>
  );
}

function FloComposerButton({ icon, label }: { icon: string; label: string }) {
  return (
    <button
      type="button"
      disabled
      aria-label={`${label} (jeszcze nieczynne)`}
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--ff-border)] text-[var(--ff-text-muted)] transition-colors hover:bg-[var(--ff-surface-hover)] disabled:cursor-not-allowed disabled:hover:bg-transparent [@media(pointer:coarse)]:size-11"
    >
      <span aria-hidden className="material-symbols-outlined text-[18px] [@media(pointer:coarse)]:text-[20px]">
        {icon}
      </span>
    </button>
  );
}
