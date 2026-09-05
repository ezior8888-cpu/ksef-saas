import { floKindLabel } from '@/components/flo/kind-labels';
import { blockedKinds } from '@/lib/flo/flags';
import {
  COST_HARD_LIMIT_PLN,
  COST_TARGET_PLN,
  readCostMetrics,
  readProposalMetrics,
} from '@/lib/flo/metrics';
import { readRollout, ROLLOUT_ORDER } from '@/lib/flo/rollout';
import { accuracyByKind, isReadyToReveal } from '@/lib/flo/shadow';
import { cn } from '@/lib/utils';

/**
 * Panel operatora agenta (krok 35 toru B).
 *
 * ODPOWIADA NA JEDNO PYTANIE: która funkcja jest gotowa wyjść z ukrycia.
 * Wszystko inne na tym ekranie służy temu pytaniu — trafność w trybie cichym,
 * sześć wskaźników tygodniowych, koszt modelu i stan kanarka.
 *
 * Liczby liczy silnik (`lib/flo/metrics.ts`, `shadow.ts`, `rollout.ts`).
 * Ten plik ich nie przelicza — układa je tak, żeby dało się podjąć decyzję
 * bez wchodzenia do bazy.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Flo — panel operatora' };

/**
 * Kurs do przeliczenia kosztu modelu. Podawany z zewnątrz, bo zmienia się
 * codziennie; metryka po kursie sprzed roku myli bardziej, niż pomaga.
 */
const USD_TO_PLN = Number(process.env.FLO_USD_PLN ?? '4.0');

export default async function AdminFloPage() {
  const [rows, cost, accuracy] = await Promise.all([
    readProposalMetrics(),
    readCostMetrics(USD_TO_PLN),
    accuracyByKind(),
  ]);

  const rollouts = await Promise.all(
    ROLLOUT_ORDER.map(async (entry) => ({
      kind: entry.kind,
      state: await readRollout(entry.kind),
    })),
  );

  const totals = rows.reduce(
    (acc, row) => ({
      total: acc.total + row.counts.total,
      accepted: acc.accepted + row.counts.accepted,
      dismissed: acc.dismissed + row.counts.dismissed,
      expired: acc.expired + row.counts.expired,
      blocked: acc.blocked + row.counts.blocked,
      undone: acc.undone + row.counts.undone,
      staleBlocked: acc.staleBlocked + row.counts.staleBlocked,
    }),
    {
      total: 0,
      accepted: 0,
      dismissed: 0,
      expired: 0,
      blocked: 0,
      undone: 0,
      staleBlocked: 0,
    },
  );

  const pct = (part: number, whole: number) =>
    whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-semibold tracking-tighter-display">
          Flo — tryb cichy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Która funkcja jest gotowa wyjść z ukrycia i ile nas kosztuje.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Metric label="Propozycje" value={String(totals.total)} />
        <Metric
          label="Przyjęte"
          value={pct(totals.accepted, totals.total)}
          hint="zatwierdzone albo wykonane"
        />
        <Metric
          label="Zignorowane"
          value={pct(totals.expired, totals.total)}
          hint="wygasły bez decyzji — karta nie była dość ważna"
        />
        <Metric
          label="Cofnięte"
          value={pct(totals.undone, totals.accepted)}
          hint="liczone od przyjętych, nie od wszystkich"
        />
        <Metric
          label="Zablokowane re-walidacją"
          value={String(totals.staleBlocked)}
          hint="dane zmieniły się między propozycją a kliknięciem"
        />
        <Metric
          label="Koszt modelu"
          value={`${(cost.avgPerTenantUsd * USD_TO_PLN).toFixed(2)} zł`}
          hint={`średnio na konto · ${cost.period.label} · cel ${COST_TARGET_PLN.toFixed(2)} zł · limit ${COST_HARD_LIMIT_PLN.toFixed(2)} zł`}
          alarm={cost.overHardLimit > 0}
        />
      </section>

      {cost.overHardLimit > 0 ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {cost.overHardLimit} kont przekroczyło twardy limit kosztu w okresie{' '}
          {cost.period.label}. Te konta działają w trybie regułowym, bez modelu.
        </p>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Trafność w trybie cichym</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Próg zależy od promienia rażenia: pomyłka w rejestrze państwowym
          kosztuje inaczej niż nietrafiona podpowiedź.
        </p>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Funkcja</th>
                <th className="p-2 font-medium">Promień</th>
                <th className="p-2 text-right font-medium">Rozstrzygnięte</th>
                <th className="p-2 text-right font-medium">Trafność</th>
                <th className="p-2 font-medium">Werdykt</th>
              </tr>
            </thead>
            <tbody>
              {accuracy.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-muted-foreground">
                    Tryb cichy nie zebrał jeszcze ani jednej propozycji.
                  </td>
                </tr>
              ) : (
                accuracy.map((stat) => {
                  const verdict = isReadyToReveal(stat);
                  return (
                    <tr key={stat.kind} className="border-t">
                      <td className="p-2">{floKindLabel(stat.kind)}</td>
                      <td className="p-2 tabular-nums">
                        {stat.radius}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {stat.settled}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {stat.accuracy === null ? '—' : stat.accuracy + '%'}
                      </td>
                      <td className="p-2">
                        <VerdictBadge verdict={verdict} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Kanarek</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Funkcje promienia 4 wychodzą do klientów etapami: dziesięć procent
          kont, potem połowa, potem wszyscy.
        </p>

        <ul className="space-y-2">
          {rollouts.map(({ kind, state }) => (
            <li
              key={kind}
              className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"
            >
              <span className="min-w-0 flex-1">{floKindLabel(kind)}</span>
              <span className="tabular-nums text-muted-foreground">
                {state ? `${state.stage}% kont` : 'nieodsłonięte'}
              </span>
              {state?.halted ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  wstrzymane: {state.haltReason ?? 'skargi'}
                </span>
              ) : null}
              {state && state.complaints > 0 ? (
                <span className="text-xs text-muted-foreground">
                  skargi: {state.complaints}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Wyłączone funkcje</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Blokady z kodu (`lib/flo/flags.ts`). Włączenie wymaga commita
          z uzasadnieniem — świadomie, żeby nikt nie odsłonił funkcji
          podatkowej jednym kliknięciem w panelu.
        </p>

        <ul className="space-y-2">
          {blockedKinds().map((entry) => (
            <li key={entry.kind} className="rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{floKindLabel(entry.kind)}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {reasonLabel(entry.status.reason)}
                </span>
              </div>
              {entry.status.note ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.status.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Ruch według funkcji</h2>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Funkcja</th>
                <th className="p-2 text-right font-medium">Razem</th>
                <th className="p-2 text-right font-medium">Przyjęte</th>
                <th className="p-2 text-right font-medium">Zignorowane</th>
                <th className="p-2 text-right font-medium">Cofnięte</th>
                <th className="p-2 text-right font-medium">Re-walidacja</th>
                <th className="p-2 text-right font-medium">Blokada techn.</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-muted-foreground">
                    Brak propozycji w bazie.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.kind} className="border-t">
                    <td className="p-2">{floKindLabel(row.kind)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {row.counts.total}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {row.rates.acceptedPct}%
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {row.rates.ignoredPct}%
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {row.rates.undonePct}%
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {row.counts.staleBlocked}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {row.counts.blocked}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  alarm,
}: {
  label: string;
  value: string;
  hint?: string;
  alarm?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        alarm && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <div className="text-xs text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

function VerdictBadge({
  verdict,
}: {
  verdict: ReturnType<typeof isReadyToReveal>;
}) {
  if (verdict.ready) {
    return (
      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
        gotowa do odsłonięcia
      </span>
    );
  }

  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {verdictLabel(verdict.reason)}
    </span>
  );
}

/** Powód, dla którego funkcja jeszcze nie wychodzi z ukrycia. */
function verdictLabel(reason: string): string {
  if (reason === 'sample_too_small') return 'za mała próbka';
  if (reason === 'golden_set_failed') return 'błąd na złotym zbiorze';
  return 'trafność poniżej progu';
}

function reasonLabel(reason: string | undefined): string {
  if (reason === 'legal') return 'czeka na prawnika';
  if (reason === 'unverified_data') return 'dane niepotwierdzone';
  return 'niezbudowana';
}
