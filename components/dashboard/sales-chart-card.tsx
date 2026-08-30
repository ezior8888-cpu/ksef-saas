/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — rama panelu.
 *
 * Wykres sprzedaży 6 miesięcy. Do 30.08.2026 stał wprost w
 * `app/(dashboard)/dashboard/page.tsx`; przeniesiony na `/przeplywy`, bo
 * dashboard oddał całą powierzchnię agentowi FLO.
 *
 * ZMIANA WOBEC ORYGINAŁU: kolory SVG szły wcześniej zaszytym hexem
 * (`#34d399`, `#1c2230`, `#12171f`, `#5b6472`, `#3a4452`). Na białym tle linia
 * i siatka byłyby niewidoczne, więc wszystko idzie teraz przez tokeny `--ff-*`
 * i wykres reaguje na przełącznik motywu.
 */

/* ── Geometria wykresu — 1:1 z prototypu ─────────────────────────────────────
 * Płótno 1400×260 skalowane do szerokości karty. `PAD` zostawia miejsce na
 * podpisy osi Y po lewej, `TOP`/dolne 30 px na etykiety miesięcy pod spodem.
 * ────────────────────────────────────────────────────────────────────────── */
const CHART_W = 1400;
const CHART_H = 260;
const CHART_PAD = 40;
const CHART_TOP = 20;
const PLOT_W = CHART_W - CHART_PAD * 2;
const PLOT_H = CHART_H - CHART_TOP - 30;

/**
 * „Ładny” szczyt osi Y: 4 równe kroki, każdy zaokrąglony w górę do 1/2/2.5/5×10ⁿ.
 * Bez tego linie siatki wypadałyby na wartościach typu 47 813 zamiast 50k.
 */
export function niceAxisMax(rawMax: number): number {
  if (rawMax <= 0) return 4;
  const target = rawMax / 4;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((m) => m * magnitude)
      .find((candidate) => candidate >= target) ?? 10 * magnitude;
  return step * 4;
}

/** Podpis linii siatki: powyżej 1000 skracamy do „k”, niżej pokazujemy wprost. */
function axisLabel(value: number, axisMax: number): string {
  if (axisMax >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

export interface SalesChartMonth {
  key: string;
  label: string;
}

export interface SalesChartCardProps {
  months: SalesChartMonth[];
  currentSeries: number[];
  prevSeries: number[];
  currentMonthKey: string;
  year: number;
}

export function SalesChartCard({
  months,
  currentSeries,
  prevSeries,
  currentMonthKey,
  year,
}: SalesChartCardProps) {
  const hasPrevSeries = prevSeries.some((v) => v > 0);
  const axisMax = niceAxisMax(Math.max(...currentSeries, ...prevSeries, 0));

  const chartX = (i: number) =>
    CHART_PAD + (PLOT_W / Math.max(1, months.length - 1)) * i;
  const chartY = (v: number) => CHART_TOP + PLOT_H - (v / axisMax) * PLOT_H;
  const linePath = (data: number[]) =>
    data
      .map(
        (v, i) =>
          `${i ? 'L' : 'M'}${chartX(i).toFixed(1)} ${chartY(v).toFixed(1)}`,
      )
      .join(' ');
  const areaPath = (data: number[]) =>
    `M${chartX(0)} ${CHART_TOP + PLOT_H} ${data
      .map((v, i) => `L${chartX(i).toFixed(1)} ${chartY(v).toFixed(1)}`)
      .join(' ')} L${chartX(data.length - 1)} ${CHART_TOP + PLOT_H} Z`;

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] px-8 py-[30px]">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--ff-text-strong)]">
            Sprzedaż w ostatnich 6 miesiącach
          </h2>
          <p className="mt-1.5 text-[13px] text-[var(--ff-text-muted)]">
            Sumaryczna kwota brutto wystawionych faktur
          </p>
        </div>
        <div className="flex gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--ff-surface-chip)] px-3 py-1.5 text-xs text-[var(--ff-text)]">
            <span className="size-2 shrink-0 rounded-full bg-[var(--ff-accent)]" />
            {year}
          </span>
          <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-[var(--ff-text-dim)]">
            <span className="size-2 shrink-0 rounded-full bg-[var(--ff-border-strong)]" />
            {year - 1}
          </span>
        </div>
      </div>

      {currentSeries.every((v) => v === 0) ? (
        <p className="mt-4 text-center text-xs text-[var(--ff-text-dim)]">
          Brak faktur w tym okresie — oś pokazuje skalę miesięcy
        </p>
      ) : null}

      <div className="mt-5">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          width="100%"
          className="block overflow-visible"
          role="img"
          aria-label="Wykres sprzedaży brutto ostatnich 6 miesięcy"
        >
          <defs>
            <linearGradient id="ff-dash-area" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--ff-accent)"
                stopOpacity="0.18"
              />
              <stop offset="100%" stopColor="var(--ff-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridFractions.map((f) => {
            const gy = CHART_TOP + PLOT_H - f * PLOT_H;
            return (
              <g key={f}>
                <line
                  x1={CHART_PAD}
                  y1={gy}
                  x2={CHART_W - CHART_PAD}
                  y2={gy}
                  stroke="var(--ff-border)"
                  strokeWidth="1"
                />
                <text
                  x={CHART_PAD - 10}
                  y={gy + 4}
                  textAnchor="end"
                  fill="var(--ff-text-dim)"
                  fontSize="11"
                  className="font-mono"
                >
                  {axisLabel(f * axisMax, axisMax)}
                </text>
              </g>
            );
          })}

          <path d={areaPath(currentSeries)} fill="url(#ff-dash-area)" />
          {hasPrevSeries ? (
            <path
              d={linePath(prevSeries)}
              fill="none"
              stroke="var(--ff-border-strong)"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
          ) : null}
          <path
            d={linePath(currentSeries)}
            fill="none"
            stroke="var(--ff-accent)"
            strokeWidth="2.5"
          />
          {currentSeries.map((v, i) => (
            <circle
              key={months[i]!.key}
              cx={chartX(i)}
              cy={chartY(v)}
              r={4}
              fill="var(--ff-surface)"
              stroke="var(--ff-accent)"
              strokeWidth="2"
            />
          ))}
          {months.map((m, i) => (
            <text
              key={m.key}
              x={chartX(i)}
              y={CHART_H - 6}
              textAnchor="middle"
              fill={
                m.key === currentMonthKey
                  ? 'var(--ff-accent)'
                  : 'var(--ff-text-dim)'
              }
              fontSize="12"
            >
              {m.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
