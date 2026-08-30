import Link from 'next/link';

import { clockLabel } from '@/components/flo/format';
import type { FloProposalView } from '@/types/flo';

/**
 * MIEJSCE NA KARTĘ — tymczasowe.
 *
 * W kroku 3 wchodzi tu karta bazowa, a po niej sześć wariantów (`info`,
 * `single`, `preview`, `choice`, `list`, `input`) z prawdziwymi przyciskami,
 * odliczaniem i paskiem cofnięcia. Do tego czasu ten komponent pokazuje samą
 * treść propozycji, żeby dało się zobaczyć oś zdarzeń na komplecie atrap
 * i złapać przepełnienia tekstem, zanim powstaną akcje.
 *
 * ŚWIADOMIE BEZ PRZYCISKÓW: pusty przycisk „Wyślij do KSeF”, który nic nie
 * robi, jest gorszy niż brak przycisku. Nikt się na nim nie sparzy, jeśli go
 * nie ma.
 */
export function FloCardSlot({ proposal }: { proposal: FloProposalView }) {
  const time = clockLabel(proposal.createdAt);

  return (
    <article className="flex gap-3">
      <time
        dateTime={proposal.createdAt}
        className="w-11 shrink-0 pt-3 text-right text-xs tabular-nums text-[var(--ff-text-dim)]"
      >
        {time}
      </time>

      <div className="min-w-0 flex-1 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-3.5">
        <h3 className="text-sm font-semibold break-words text-[var(--ff-text-strong)]">
          {proposal.title}
        </h3>

        <p className="mt-1 text-sm break-words text-[var(--ff-text-soft)]">
          {proposal.body}
        </p>

        {proposal.evidence.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--ff-text-dim)]">
              Dlaczego to widzę:
            </span>
            {proposal.evidence.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-[var(--ff-border)] px-2 py-0.5 text-[11px] text-[var(--ff-text-muted)] transition-colors hover:border-[var(--ff-border-strong)] hover:text-[var(--ff-text)]"
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}

        {/* Znika razem z tym plikiem w kroku 3. */}
        <p className="mt-3 border-t border-dashed border-[var(--ff-border)] pt-2 text-[11px] text-[var(--ff-text-faint)]">
          Wariant karty: {proposal.variant} — przyciski dochodzą w następnym
          kroku.
        </p>
      </div>
    </article>
  );
}
