import type { FloProposalView } from '@/types/flo';

import { clockLabel } from './format';
import { FloProposalCard } from './proposal-card';
import { groupByDay } from './timeline';

/**
 * Wątek agenta (krok 4 toru B) — lista kart pogrupowana po dniach.
 *
 * UKŁAD Z MAKIETY: nagłówek dnia („WCZORAJ”, „DZIŚ”), a przy każdej karcie
 * godzina w lewej kolumnie. Godzina siedzi w wątku, a nie w karcie, bo to
 * wątek jest osią czasu — ta sama karta użyta na dashboardzie (krok 15)
 * pokazuje godzinę u siebie, bo tam nie ma osi, w którą można ją wpisać.
 *
 * Kolejność: dni chronologicznie, wewnątrz dnia najpierw priorytet, potem
 * czas — uzasadnienie w `timeline.ts`.
 *
 * Komponent jest serwerowy. Klienckie są dopiero karty, i tylko one.
 */
export function FloThread({
  proposals,
  now,
  className,
}: {
  proposals: readonly FloProposalView[];
  /** wstrzykiwany czas — do testów; normalnie „teraz” z renderu */
  now?: Date;
  className?: string;
}) {
  const groups = groupByDay(proposals, now ?? new Date());

  if (groups.length === 0) return <FloThreadEmpty className={className} />;

  return (
    <section aria-label="Wątek Flo" className={className}>
      {groups.map((group) => (
        <div key={group.key} className="space-y-3">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[var(--ff-text-dim)]">
            {group.label}
          </h2>

          {group.items.map((proposal) => (
            <div key={proposal.id} className="flex gap-3">
              <time
                dateTime={proposal.createdAt}
                className="hidden w-11 shrink-0 pt-3.5 text-right text-xs tabular-nums text-[var(--ff-text-dim)] sm:block"
              >
                {clockLabel(proposal.createdAt)}
              </time>

              <FloProposalCard
                view={proposal}
                showTime={false}
                className="min-w-0 flex-1"
              />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

/**
 * Stan pusty.
 *
 * Cisza jest dobrą wiadomością i tak ma brzmieć. Żadnej zachęty „skonfiguruj
 * coś”, żadnego pustego rysunku z wykrzyknikiem — jedno spokojne zdanie
 * i tyle. Klient, który nic tu nie zastał, ma odejść od ekranu z poczuciem,
 * że jest w porządku, a nie że coś zaniedbał.
 */
function FloThreadEmpty({ className }: { className?: string }) {
  return (
    <section
      aria-label="Wątek Flo"
      className={className}
    >
      <p className="max-w-sm text-sm text-[var(--ff-text-muted)]">
        Nic nie wymaga Twojej decyzji. Jak coś się wydarzy w fakturach,
        kosztach albo w KSeF — znajdziesz to tutaj.
      </p>
    </section>
  );
}
