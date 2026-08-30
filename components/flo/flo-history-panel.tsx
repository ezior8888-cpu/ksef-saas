/**
 * „Co Flo zrobił” — historia wykonanych spraw.
 *
 * Na razie sam stan pusty i to jest uczciwe: silnik nie ma jeszcze odczytu
 * historii (`FloScheduledView` opisuje kolejkę, nie przeszłość), a wymyślanie
 * jej po stronie interfejsu skończyłoby się listą, która nie zgadza się
 * z tym, co naprawdę się wydarzyło. Wpisane w dzienniku jako pytanie do
 * silnika.
 */
export function FloHistoryPanel() {
  return (
    <section
      aria-label="Co Flo zrobił"
      className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4"
    >
      <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[var(--ff-text-dim)]">
        CO FLO ZROBIŁ
      </h2>
      <p className="mt-3 text-xs text-[var(--ff-text-muted)]">
        Historia wykonanych spraw pojawi się tutaj — z godziną i z tym, kto
        kliknął.
      </p>
    </section>
  );
}
