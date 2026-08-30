/**
 * Pole rozmowy z agentem — na razie sam pas, bez działania.
 *
 * Stoi tu, bo bez niego ekran kłamie o tym, czym FLO ma być: nie tylko
 * strumieniem propozycji, ale też kimś, do kogo można się odezwać. Pole jest
 * jednak WYŁĄCZONE i mówi o tym wprost, zamiast przyjmować tekst i wyrzucać
 * go do kosza. Rozmowa (`chat.draft`, O-04) wchodzi osobnym krokiem.
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
        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ff-text)] placeholder:text-[var(--ff-text-faint)] focus:outline-none disabled:cursor-not-allowed"
      />
      <span
        aria-hidden
        className="material-symbols-outlined text-[18px] text-[var(--ff-text-faint)]"
      >
        send
      </span>
    </div>
  );
}
