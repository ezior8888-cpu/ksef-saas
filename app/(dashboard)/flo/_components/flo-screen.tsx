import { Suspense } from 'react';

import { FloScheduledPanel } from '@/components/flo/scheduled-panel';
import { FloThreadClient } from '@/components/flo/thread-client';
import { countTodayTasks } from '@/components/flo/timeline';
import type { FloProposalView, FloScheduledView } from '@/types/flo';

import { FloComposer } from './flo-composer';
import { FloHeader } from './flo-header';
import { FloHistoryPanel } from './flo-history-panel';
import { FloPhotoBanner } from './flo-photo-banner';

/**
 * Ekran agenta: nagłówek, wątek, prawa kolumna, pole rozmowy.
 *
 * Szkielet jest serwerowy, a klienckie są wyspy w środku: wątek (bo woła
 * akcje i trzyma stan wykonywania) i panel zatwierdzonych (bo ma „Wstrzymaj”).
 * Nagłówek, historia i pas rozmowy zostają po stronie serwera — nie mają
 * czego robić w przeglądarce.
 *
 * UKŁAD: wątek jest szeroki i po lewej, bo to on jest treścią; prawa kolumna
 * to dwie listy pomocnicze i schodzi pod wątek na wąskim ekranie.
 */
export function FloScreen({
  proposals,
  scheduled,
  usingFixtures = false,
}: {
  proposals: FloProposalView[];
  scheduled: FloScheduledView[];
  /** true = na ekranie są atrapy; pokazujemy o tym uczciwą adnotację */
  usingFixtures?: boolean;
}) {
  const todayTasks = countTodayTasks(proposals);

  // Najświeższy koszt — po nim pasek zdjęcia poznaje, że odczyt się udał.
  const latestExpenseAt =
    proposals
      .filter((p) => p.kind.startsWith('expense.'))
      .map((p) => p.createdAt)
      .sort()
      .at(-1) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <FloHeader todayTasks={todayTasks} usingFixtures={usingFixtures} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col gap-3">
          <Suspense fallback={null}>
            <FloPhotoBanner latestExpenseAt={latestExpenseAt} />
          </Suspense>

          {/* Widoczny zastępnik, nie `null`: gdyby ta wyspa kiedyś nie
              wstała, pusty ekran wyglądałby jak „nic nie masz do zrobienia”,
              a to jest komunikat, którego nie wolno pokazać nieprawdziwie. */}
          <Suspense
            fallback={
              <div className="min-h-0 flex-1 rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4 text-xs text-[var(--ff-text-muted)] md:p-5">
                Zbieram Twoje sprawy…
              </div>
            }
          >
            <FloThreadClient
              proposals={proposals}
              className="min-h-0 flex-1 space-y-6 overflow-y-auto rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4 md:p-5"
            />
          </Suspense>
          <FloComposer />
        </div>

        <aside className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
          <FloScheduledPanel
            scheduled={scheduled}
            className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4"
          />
          <FloHistoryPanel />
        </aside>
      </div>
    </div>
  );
}
