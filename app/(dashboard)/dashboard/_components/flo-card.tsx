import Link from 'next/link';

import { listProposals } from '@/app/actions/flo';
import { clockLabel, countLabel, FLO_FORMS } from '@/components/flo/format';
import { countTodayTasks, sortByUrgency } from '@/components/flo/timeline';

/**
 * Karta agenta na dashboardzie (krok 15 toru B).
 *
 * PODPIS STANU zamiast „TRYB 3” z sierpniowej makiety. Klient ma z jednego
 * zdania wiedzieć, czego się po agencie spodziewać — a nie odczytywać numer
 * poziomu, który i tak u wszystkich jest ten sam. Zdanie opisuje regułę
 * z części II.3 planu i jest jedyną odpowiedzią na pytanie „ile on tu może”.
 *
 * Pokazujemy najwyżej trzy sprawy, po pilności. Dashboard jest przystankiem,
 * nie wątkiem — kto chce całości, klika „Zobacz wszystko”.
 */
export async function FloDashboardCard() {
  const proposals = await listProposals();
  const todayTasks = countTodayTasks(proposals);
  const top = sortByUrgency(proposals).slice(0, 3);

  return (
    <section
      aria-label="Flo"
      className="rounded-[14px] border border-[var(--ff-border)] bg-[var(--ff-surface)] p-[22px]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ff-accent-tint)] text-base font-semibold text-[var(--ff-accent)]"
        >
          F
        </span>

        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--ff-text-strong)]">
            Flo
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Robi sam to, co da się cofnąć. Pyta przed każdą wysyłką.
          </p>
        </div>

        <span className="ml-auto shrink-0 rounded-full border border-[var(--ff-border)] bg-[var(--ff-surface-chip)] px-2.5 py-1 text-xs text-[var(--ff-text-soft)]">
          {countLabel(todayTasks, FLO_FORMS.zadanie)} dziś
        </span>
      </div>

      {top.length === 0 ? (
        <p className="mt-4 text-xs text-[var(--ff-text-muted)]">
          Nic nie wymaga Twojej decyzji.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {top.map((proposal) => (
            <li key={proposal.id} className="flex items-baseline gap-2.5">
              <time
                dateTime={proposal.createdAt}
                className="shrink-0 text-[11px] tabular-nums text-[var(--ff-text-dim)]"
              >
                {clockLabel(proposal.createdAt)}
              </time>
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--ff-text-soft)]">
                {proposal.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/flo"
        className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--ff-accent)] transition-opacity hover:opacity-80"
      >
        Zobacz wszystko
        <span aria-hidden className="material-symbols-outlined text-[14px]">
          arrow_forward
        </span>
      </Link>
    </section>
  );
}

/** Zastępnik na czas ładowania — ten sam kształt, żeby nic nie podskoczyło. */
export function FloDashboardCardSkeleton() {
  return (
    <section className="rounded-[14px] border border-[var(--ff-border)] bg-[var(--ff-surface)] p-[22px]">
      <div className="flex items-center gap-3">
        <div className="size-9 shrink-0 animate-pulse motion-reduce:animate-none rounded-full bg-[var(--ff-surface-muted)]" />
        <div className="space-y-1.5">
          <div className="h-3 w-12 animate-pulse motion-reduce:animate-none rounded bg-[var(--ff-surface-muted)]" />
          <div className="h-2.5 w-56 animate-pulse motion-reduce:animate-none rounded bg-[var(--ff-surface-muted)]" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-3 w-full animate-pulse motion-reduce:animate-none rounded bg-[var(--ff-surface-muted)]"
          />
        ))}
      </div>
    </section>
  );
}
