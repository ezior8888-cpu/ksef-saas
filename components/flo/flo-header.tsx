import { countLabel, FLO_FORMS } from '@/components/flo/format';

/**
 * Nagłówek agenta: kto to jest, co robi teraz i ile spraw czeka na decyzję.
 *
 * CZEGO TU NIE MA I NIE BĘDZIE: znacznika „TRYB 3” z sierpniowej makiety
 * ani żadnego innego poziomu, trybu czy suwaka samodzielności. Zachowanie
 * agenta jest identyczne u każdego klienta: rzeczy odwracalne wewnątrz konta
 * robi sam i pokazuje „cofnij”, wszystko wychodzące na zewnątrz wymaga
 * kliknięcia — zawsze. Podpis „Pracuje sam · informuje” opisuje tę jedną
 * zasadę, a nie ustawienie do zmiany.
 */
export function FloHeader({
  todayTasks,
  usingFixtures = false,
}: {
  todayTasks: number;
  usingFixtures?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ff-accent-tint)] text-lg font-semibold text-[var(--ff-accent)]"
      >
        F
      </span>

      <div className="min-w-0">
        <h1 className="text-base font-semibold text-[var(--ff-text-strong)]">
          Flo
        </h1>
        <p className="flex items-center gap-1.5 text-xs text-[var(--ff-text-muted)]">
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-[var(--ff-accent)]"
          />
          Pracuje sam · informuje
        </p>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {usingFixtures ? (
          <span className="rounded-full border border-[var(--ff-warn-border)] bg-[var(--ff-warn-tint)] px-2.5 py-1 text-xs text-[var(--ff-warn-text)]">
            Dane przykładowe
          </span>
        ) : null}

        <span className="flex items-center gap-1.5 rounded-full border border-[var(--ff-border)] bg-[var(--ff-surface-chip)] px-2.5 py-1 text-xs text-[var(--ff-text-soft)]">
          <span
            aria-hidden
            className="material-symbols-outlined text-[14px] leading-none text-[var(--ff-accent)]"
          >
            bolt
          </span>
          {/* „1 zadanie dziś”, „2 zadania dziś”, „5 zadań dziś”, „0 zadań dziś” */}
          {countLabel(todayTasks, FLO_FORMS.zadanie)} dziś
        </span>
      </div>
    </header>
  );
}
