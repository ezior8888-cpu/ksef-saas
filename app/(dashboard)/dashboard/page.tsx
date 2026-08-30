import { listProposals, listScheduled } from '@/app/actions/flo';
import { SectionErrorBoundary } from '@/components/dashboard/section-error-boundary';
import { FloScreen } from '@/components/flo/flo-screen';
import {
  formatPlInt,
  formatPlMoney,
  getMonthlyFigures,
  type MonthlyFigures,
} from '@/lib/dashboard/monthly-figures';
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

  const liczby = <MonthlyFiguresCard figures={figures} />;

  if (!agent.ok) {
    return (
      <div className="grid grid-cols-1 items-start gap-4 pb-8 pt-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section
          role="status"
          className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] px-[22px] py-5"
        >
          <p className="text-[13px] text-[var(--ff-text-muted)]">
            Nie mogę teraz sięgnąć po Twoje sprawy. Liczby miesiąca obok są
            aktualne — spróbuj odświeżyć za chwilę.
          </p>
        </section>
        {liczby}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-8 pt-4">
      {agent.fixtures ? (
        <p
          role="status"
          className="rounded-xl border border-[var(--ff-warn-border)] bg-[var(--ff-warn-tint)] px-4 py-2.5 text-[12.5px] text-[var(--ff-warn-text)]"
        >
          <strong className="font-semibold text-[var(--ff-warn)]">
            Dane przykładowe.
          </strong>{' '}
          Baza deweloperska nie ma tabel agenta, więc to są atrapy
          z&nbsp;<code>lib/flo/fixtures.ts</code>, a nie Twoje sprawy. Ten pasek
          nie może pojawić się na produkcji.
        </p>
      ) : null}

      <SectionErrorBoundary label="Flo" fallback={liczby}>
        <FloScreen
          proposals={agent.proposals}
          scheduled={agent.scheduled}
          showHeader={false}
          aside={liczby}
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

/** Karta „liczby miesiąca” — góra prawej kolumny, jak na makiecie. */
function MonthlyFiguresCard({ figures }: { figures: MonthlyFigures }) {
  return (
    <section className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] px-4 py-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--ff-text-muted)]">
        {figures.monthName}
      </h2>

      <dl className="mt-3.5 flex flex-col gap-3.5">
        <StatRow
          icon="description"
          label="Wystawione faktury"
          sublabel={
            figures.hasPrevMonth
              ? `Poprzedni miesiąc: ${formatPlInt(figures.prevIssuedCount)}`
              : 'Pierwszy miesiąc'
          }
          value={formatPlInt(figures.issuedCount)}
          accent
        />
        <StatRow
          icon="check_circle"
          label="Przyjęte przez KSeF"
          sublabel={`${formatPlInt(figures.pendingCount)} oczekuje`}
          value={formatPlInt(figures.acceptedCount)}
          accent
        />
        <StatRow
          icon="credit_card"
          label="VAT należny"
          sublabel="JPK_V7"
          value={formatPlMoney(figures.totalVat)}
          tone="warn"
        />
        <StatRow
          icon="trending_up"
          label="Sprzedaż brutto"
          sublabel={
            figures.isBestMonthOfYear
              ? 'Najlepszy wynik w roku'
              : figures.hasPrevMonth
                ? `${figures.momGrossPct >= 0 ? '+' : ''}${figures.momGrossPct}% m/m`
                : 'Pierwszy miesiąc ze sprzedażą'
          }
          value={formatPlMoney(figures.totalGross)}
        />
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--ff-border)] pt-3.5">
        <span className="text-[12.5px] font-medium text-[var(--ff-text-soft)]">
          Termin VAT · {figures.vatDueLabel}
        </span>
        <span className="shrink-0 rounded-full bg-[var(--ff-warn-tint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ff-warn)]">
          {figures.daysToVatDue} {figures.daysToVatDue === 1 ? 'dzień' : 'dni'}
        </span>
      </div>
    </section>
  );
}

/** Wiersz szyny: ikona, etykieta z podetykietą, liczba po prawej. */
function StatRow({
  icon,
  label,
  sublabel,
  value,
  accent = false,
  tone,
}: {
  icon: string;
  label: string;
  sublabel: string;
  value: string;
  accent?: boolean;
  tone?: 'warn';
}) {
  const valueColor =
    tone === 'warn'
      ? 'text-[var(--ff-warn)]'
      : accent
        ? 'text-[var(--ff-accent)]'
        : 'text-[var(--ff-text-strong)]';

  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--ff-surface-chip)] text-[var(--ff-text-muted)]"
        aria-hidden
      >
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <dt className="truncate text-[13px] font-medium text-[var(--ff-text-soft)]">
          {label}
        </dt>
        <dd className="truncate text-[11.5px] text-[var(--ff-text-dim)]">
          {sublabel}
        </dd>
      </div>
      <span
        className={`shrink-0 text-[17px] font-semibold tabular-nums ${valueColor}`}
      >
        {value}
      </span>
    </div>
  );
}
