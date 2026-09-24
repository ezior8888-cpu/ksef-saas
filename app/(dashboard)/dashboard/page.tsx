import { Suspense } from 'react';

import { listProposals, listScheduled } from '@/app/actions/flo';
import { SectionErrorBoundary } from '@/components/dashboard/section-error-boundary';
import { FloComposer } from '@/components/flo/flo-composer';
import { FloScreen } from '@/components/flo/flo-screen';
import { FloScheduledPanel } from '@/components/flo/scheduled-panel';
import { FloWelcome } from '@/components/dashboard/flo-welcome';
import DashboardVerificationBanner from '@/app/(dashboard)/_components/dashboard-verification-banner';
import { MonthlyFiguresCard } from '@/components/dashboard/monthly-figures-card';
import { getMonthlyFigures } from '@/lib/dashboard/monthly-figures';
import { FLO_FIXTURES, FLO_SCHEDULED_FIXTURES } from '@/lib/flo/fixtures';
import { isLocalDevEnv } from '@/lib/security/environment';
import { getPageContext } from '@/lib/supabase/page-context';
import type { FloProposalView, FloScheduledView } from '@/types/flo';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — kompozycja ekranu, nie jego wnętrze.
 *
 * DASHBOARD JEST EKRANEM AGENTA (decyzja właściciela produktu, 30.08.2026).
 * Wcześniej agent mieszkał na osobnej trasie `/flo`, a dashboard pokazywał
 * skrót. Teraz jest odwrotnie i tak, jak na sierpniowej makiecie: wątek zajmuje
 * główną kolumnę, a listy pomocnicze stoją z boku. `/flo` przekierowuje tutaj,
 * żeby nie zerwać linków z powiadomień push, ze ścieżki paragonu i z wątku.
 *
 * WNĘTRZE NALEŻY DO MASŁA: `FloScreen` i wszystko, co ono składa
 * (`components/flo/*`). Ta strona pobiera dane, dokłada kartę z liczbami
 * miesiąca przez gniazdo `aside` i nie zna środka wątku.
 *
 * Nagłówek agenta jest wyłączony (`showHeader={false}`) — panel ma własny
 * pasek tytułu z „Dashboard” i miesiącem, a dwa nagłówki jeden nad drugim
 * to szum. Licznik spraw wraca do wątku razem z krokiem 39 Masła.
 *
 * WYSOKOŚĆ: `h-full`, nie `calc(100vh - 5rem)`. Blokada trasy z `globals.css`
 * (`html.ff-route-dashboard`) daje temu drzewu pełną wysokość okna pomniejszoną
 * o nagłówek i dolną nawigację, licząc z tokenów `--ff-header-h`
 * i `--ff-bottom-nav-h`. Ręcznie wpisane 5rem rozjeżdżało się przy każdej
 * zmianie nagłówka i nie wiedziało nic o pasku domowym telefonu.
 *
 * Pełna mapa: `docs/flo/UKLAD-DASHBOARDU.md`.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardHomePage() {
  const { supabase, tenantId } = await getPageContext();

  // Liczby miesiąca są niezależne od agenta — pobierane równolegle, żeby
  // wolniejsza strona nie czekała na drugą.
  const [figures, agent] = await Promise.all([
    getMonthlyFigures(supabase, tenantId),
    loadAgent(),
  ]);

  const szyna = (
    <>
      <Suspense fallback={null}>
        <DashboardVerificationBanner variant="rail" />
      </Suspense>
      <MonthlyFiguresCard figures={figures} />
    </>
  );

  if (!agent.ok) {
    return (
      <div className="grid h-full grid-cols-1 items-start gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          role="status"
          className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] px-[22px] py-5"
        >
          <p className="text-[13px] text-[var(--ff-text-muted)]">
            Nie mogę teraz sięgnąć po Twoje sprawy. Liczby miesiąca obok są
            aktualne — spróbuj odświeżyć za chwilę.
          </p>
        </section>
        {szyna}
      </div>
    );
  }

  if (agent.proposals.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 py-4">
        {agent.fixtures ? <PasekAtrap /> : null}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex min-h-0 flex-1 rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)]">
              <FloWelcome />
            </div>
            <FloComposer />
          </div>
          <aside className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
            {szyna}
            <FloScheduledPanel
              scheduled={agent.scheduled}
              className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4"
            />
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 py-4">
      {agent.fixtures ? <PasekAtrap /> : null}

      <SectionErrorBoundary label="Flo" fallback={szyna}>
        <FloScreen
          proposals={agent.proposals}
          scheduled={agent.scheduled}
          showHeader={false}
          aside={szyna}
        />
      </SectionErrorBoundary>
    </div>
  );
}

/**
 * Odczyt agenta odporny na awarię silnika.
 *
 * Wyjątek z `listProposals` jest tu ŁAPANY, a nie przepuszczany do granicy
 * błędu: pobranie dzieje się na poziomie strony, więc rzucony wyjątek przewraca
 * cały render, zanim granica zdąży się zamontować — sprawdzone na żywo
 * 30.08.2026, gdy brak tabel FLO w bazie deweloperskiej wygasił cały dashboard.
 *
 * Zwracamy `ok: false`, a NIE pustą listę. Pusta lista znaczy „nie masz nic do
 * zrobienia” i byłaby kłamstwem w chwili, gdy agent po prostu nie odpowiada —
 * cisza jest stanem zabronionym (własność W5 planu FLO).
 */
type AgentData =
  | {
      ok: true;
      proposals: FloProposalView[];
      scheduled: FloScheduledView[];
      /** true = na ekranie są atrapy, nie dane klienta. */
      fixtures: boolean;
    }
  | { ok: false };

async function loadAgent(): Promise<AgentData> {
  try {
    const [proposals, scheduled] = await Promise.all([
      listProposals(),
      listScheduled(),
    ]);
    return { ok: true, proposals, scheduled, fixtures: false };
  } catch (blad) {
    console.error('[dashboard] odczyt agenta nieudany:', blad);

    /**
     * AWARYJNE PRZEJŚCIE NA ATRAPY — TYLKO NA MASZYNIE DEWELOPERA.
     *
     * Baza deweloperska (Supabase Cloud, pozostałość po erze Vercela) nie ma
     * tabel FLO i nikt nie ma już do niej hasła, więc bez tego ani tor B, ani
     * tor A nie widzi interfejsu agenta na oczy. Atrapy pokrywają wszystkie
     * sześć wariantów karty i cztery typy podglądu.
     *
     * BEZPIECZNIK JEST FAIL-CLOSED: `isLocalDevEnv()` wymaga
     * `NODE_ENV === 'development'` ORAZ braku jakiegokolwiek markera produkcji.
     * Build produkcyjny ustawia `NODE_ENV=production`, więc na Hetznerze ta
     * gałąź nie ma jak się wykonać, nawet gdyby zmienne środowiskowe zniknęły.
     *
     * Na produkcji awaria zostaje awarią i klient dostaje uczciwy komunikat —
     * pokazanie mu cudzych przykładowych faktur jako własnych spraw byłoby
     * znacznie gorsze niż pusty ekran.
     */
    if (isLocalDevEnv()) {
      return {
        ok: true,
        proposals: FLO_FIXTURES,
        scheduled: FLO_SCHEDULED_FIXTURES,
        fixtures: true,
      };
    }

    return { ok: false };
  }
}

/** Uczciwa adnotacja, że na ekranie są atrapy, a nie sprawy klienta. */
function PasekAtrap() {
  return (
    <p
      role="status"
      className="shrink-0 rounded-xl border border-[var(--ff-warn-border)] bg-[var(--ff-warn-tint)] px-4 py-2.5 text-[12.5px] text-[var(--ff-warn-text)]"
    >
      <strong className="font-semibold text-[var(--ff-warn)]">
        Dane przykładowe.
      </strong>{' '}
      Baza deweloperska nie ma tabel agenta, więc to są atrapy
      z <code>lib/flo/fixtures.ts</code>, a nie Twoje sprawy. Ten pasek nie może
      pojawić się na produkcji.
    </p>
  );
}
