import { countLabel, FLO_FORMS } from '@/components/flo/format';
import type { FloScheduledView } from '@/types/flo';

/**
 * Prawa kolumna: co jest zatwierdzone i czeka na wykonanie, a pod spodem
 * miejsce na to, co FLO już zrobił.
 *
 * INWARIANT, KTÓRY TEN PANEL POKAZUJE NA EKRANIE: trafia tu WYŁĄCZNIE to,
 * co człowiek zatwierdził kliknięciem. Dlatego przy każdej pozycji stoi
 * `approvedAtLabel` — przy reklamacji „ja tego nie wysyłałem” klient musi
 * widzieć ślad własnej zgody. „Wstrzymaj” jest hamulcem na coś, na co już
 * się zgodził; nigdy sposobem wyrażania zgody.
 */
export function FloSidePanel({
  scheduled,
}: {
  scheduled: readonly FloScheduledView[];
}) {
  return (
    <aside className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
      <section
        aria-label="Co Flo zrobi dalej"
        className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[var(--ff-text-dim)]">
            CO FLO ZROBI DALEJ
          </h2>
          <span className="text-[11px] text-[var(--ff-text-faint)]">
            {countLabel(scheduled.length, FLO_FORMS.sprawa)}
          </span>
        </div>

        {scheduled.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--ff-text-muted)]">
            Nic nie czeka w kolejce. Pojawi się tu wszystko, co zatwierdzisz.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {scheduled.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium break-words text-[var(--ff-text)]">
                    {item.label}
                  </p>
                  <p className="text-[11px] text-[var(--ff-text-muted)]">
                    {item.whenLabel}
                  </p>
                  <p className="text-[11px] text-[var(--ff-text-faint)]">
                    {item.approvedAtLabel}
                  </p>
                </div>

                {/* Przycisk działa od kroku, w którym wchodzą akcje serwerowe.
                    Do tego czasu jest wyłączony — nie udajemy hamulca, którego
                    jeszcze nie ma. */}
                <button
                  type="button"
                  disabled
                  className="shrink-0 rounded-lg border border-[var(--ff-border)] px-2 py-1 text-[11px] text-[var(--ff-text-muted)] disabled:opacity-50"
                >
                  {item.cancelLabel}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-[11px] text-[var(--ff-text-faint)]">
          Wszystko z tej listy już zatwierdziłeś. Dopóki nie ruszy, możesz to
          wstrzymać.
        </p>
      </section>

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
    </aside>
  );
}
