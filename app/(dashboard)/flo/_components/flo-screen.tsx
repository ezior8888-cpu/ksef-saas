import { FloThread } from '@/components/flo/thread';
import { countTodayTasks } from '@/components/flo/timeline';
import type { FloProposalView, FloScheduledView } from '@/types/flo';

import { FloComposer } from './flo-composer';
import { FloHeader } from './flo-header';
import { FloSidePanel } from './flo-side-panel';

/**
 * Szkielet ekranu agenta: nagłówek, oś zdarzeń, prawa kolumna, pole rozmowy.
 *
 * Cały ekran jest komponentem serwerowym. Nic tu nie ma stanu, bo w tym
 * kroku nic jeszcze nie klikamy — odliczanie, zatwierdzanie i cofanie
 * przychodzą razem z kartą w kroku 3 i będą wyspami klienckimi wewnątrz
 * tego szkieletu, a nie całym ekranem. Tak zostaje po stronie przeglądarki
 * tylko to, co naprawdę musi.
 *
 * UKŁAD: oś zdarzeń jest szeroka i po lewej, bo to ona jest treścią; prawa
 * kolumna to dwie listy pomocnicze i schodzi pod oś na wąskim ekranie.
 */
export function FloScreen({
  proposals,
  scheduled,
  usingFixtures = false,
}: {
  proposals: readonly FloProposalView[];
  scheduled: readonly FloScheduledView[];
  /** true = na ekranie są atrapy; pokazujemy o tym uczciwą adnotację */
  usingFixtures?: boolean;
}) {
  const now = new Date();
  const todayTasks = countTodayTasks(proposals, now);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <FloHeader todayTasks={todayTasks} usingFixtures={usingFixtures} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col gap-3">
          <FloThread
            proposals={proposals}
            now={now}
            className="min-h-0 flex-1 space-y-6 overflow-y-auto rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4 md:p-5"
          />
          <FloComposer />
        </div>

        <FloSidePanel scheduled={scheduled} />
      </div>
    </div>
  );
}
