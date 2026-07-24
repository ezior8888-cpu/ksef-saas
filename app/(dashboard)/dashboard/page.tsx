import { createClient } from '@/lib/supabase/server';
import { DashboardExportsPdfLink } from '@/components/dashboard/exports-route-client';

export const dynamic = 'force-dynamic';

function formatPlMoney(n: number): string {
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPlInt(n: number): string {
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}

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
function niceAxisMax(rawMax: number): number {
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

export default async function DashboardHomePage() {
  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthIso = startOfMonth.toISOString().slice(0, 10);

  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStartIso = prevMonthStart.toISOString().slice(0, 10);

  const [{ data: monthInvoices }, { count: prevIssuedCount }] = await Promise.all([
    supabase
      .from('invoices')
      .select('gross_total, net_total, vat_total, ksef_status')
      .eq('direction', 'issued')
      .gte('issue_date', startOfMonthIso),
    supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'issued')
      .gte('issue_date', prevMonthStartIso)
      .lt('issue_date', startOfMonthIso),
  ]);

  const issuedCount = monthInvoices?.length ?? 0;
  const acceptedCount =
    monthInvoices?.filter((i) => i.ksef_status === 'accepted').length ?? 0;
  const pendingCount = Math.max(0, issuedCount - acceptedCount);
  const totalNet =
    monthInvoices?.reduce((sum, i) => sum + Number(i.net_total ?? 0), 0) ?? 0;
  const totalVat =
    monthInvoices?.reduce((sum, i) => sum + Number(i.vat_total ?? 0), 0) ?? 0;
  const totalGross =
    monthInvoices?.reduce((sum, i) => sum + Number(i.gross_total ?? 0), 0) ?? 0;

  /** 6 miesięcy kalendarzowych jak na osi wykresu (najstarszy = bieżący − 5). */
  const chartMonths: { key: string; prevKey: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prevKey = `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const raw = d
      .toLocaleDateString('pl-PL', { month: 'short' })
      .replace(/\./g, '')
      .trim();
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    chartMonths.push({ key, prevKey, label });
  }
  const chartWindowStartIso = `${chartMonths[0]!.key}-01`;
  /** To samo okno 6 miesięcy rok wcześniej — szara linia odniesienia. */
  const prevYearWindowStartIso = `${chartMonths[0]!.prevKey}-01`;
  const prevYearWindowEndIso = `${chartMonths[0]!.key}-01`;

  const [{ data: yearInvoices }, { data: prevYearInvoices }] = await Promise.all([
    supabase
      .from('invoices')
      .select('gross_total, issue_date')
      .eq('direction', 'issued')
      .gte('issue_date', chartWindowStartIso),
    supabase
      .from('invoices')
      .select('gross_total, issue_date')
      .eq('direction', 'issued')
      .gte('issue_date', prevYearWindowStartIso)
      .lt('issue_date', prevYearWindowEndIso),
  ]);

  const monthlyData = new Map<string, number>();
  yearInvoices?.forEach((inv) => {
    const key = inv.issue_date.slice(0, 7);
    monthlyData.set(
      key,
      (monthlyData.get(key) ?? 0) + Number(inv.gross_total ?? 0),
    );
  });

  const prevYearMonthly = new Map<string, number>();
  prevYearInvoices?.forEach((inv) => {
    const key = inv.issue_date.slice(0, 7);
    prevYearMonthly.set(
      key,
      (prevYearMonthly.get(key) ?? 0) + Number(inv.gross_total ?? 0),
    );
  });

  const yStartStr = `${now.getFullYear()}-01-01`;
  const { data: ytdInvoices } = await supabase
    .from('invoices')
    .select('gross_total, issue_date')
    .eq('direction', 'issued')
    .gte('issue_date', yStartStr);

  const ytdByMonth = new Map<string, number>();
  ytdInvoices?.forEach((inv) => {
    const key = inv.issue_date.slice(0, 7);
    ytdByMonth.set(
      key,
      (ytdByMonth.get(key) ?? 0) + Number(inv.gross_total ?? 0),
    );
  });
  const maxYtdMonthGross = Math.max(0, ...Array.from(ytdByMonth.values()));
  const isBestYearMo =
    totalGross > 0 &&
    maxYtdMonthGross > 0 &&
    totalGross >= maxYtdMonthGross - 0.01;

  const monthName = startOfMonth.toLocaleDateString('pl-PL', {
    month: 'long',
    year: 'numeric',
  });

  const prevIssued = prevIssuedCount ?? 0;
  const momPct =
    prevIssued > 0
      ? Math.round(((issuedCount - prevIssued) / prevIssued) * 100)
      : issuedCount > 0
        ? 100
        : 0;
  const momPositive = momPct >= 0;

  const vatDueDate = new Date(now.getFullYear(), now.getMonth() + 1, 25);
  const vatDueLabel = vatDueDate.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  /** Dni do terminu VAT liczone po dobach kalendarzowych, nie po milisekundach. */
  const daysToVatDue = Math.max(
    0,
    Math.round(
      (new Date(
        vatDueDate.getFullYear(),
        vatDueDate.getMonth(),
        vatDueDate.getDate(),
      ).getTime() -
        new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
        86_400_000,
    ),
  );

  const ksefPct =
    issuedCount > 0
      ? Math.min(100, Math.round((acceptedCount / issuedCount) * 100))
      : 0;

  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentSeries = chartMonths.map((m) => monthlyData.get(m.key) ?? 0);
  const prevSeries = chartMonths.map((m) => prevYearMonthly.get(m.prevKey) ?? 0);
  const hasPrevSeries = prevSeries.some((v) => v > 0);
  const axisMax = niceAxisMax(Math.max(...currentSeries, ...prevSeries, 0));

  const chartX = (i: number) =>
    CHART_PAD + (PLOT_W / (chartMonths.length - 1)) * i;
  const chartY = (v: number) =>
    CHART_TOP + PLOT_H - (v / axisMax) * PLOT_H;
  const linePath = (data: number[]) =>
    data
      .map((v, i) => `${i ? 'L' : 'M'}${chartX(i).toFixed(1)} ${chartY(v).toFixed(1)}`)
      .join(' ');
  const areaPath = (data: number[]) =>
    `M${chartX(0)} ${CHART_TOP + PLOT_H} ${data
      .map((v, i) => `L${chartX(i).toFixed(1)} ${chartY(v).toFixed(1)}`)
      .join(' ')} L${chartX(data.length - 1)} ${CHART_TOP + PLOT_H} Z`;

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="flex flex-col gap-7 pb-12 pt-9 text-[var(--ff-on-surface)]">
      <div>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
          Dashboard
        </h1>
        <p className="mt-1.5 text-sm text-[var(--ff-text-muted)]">
          Zestawienie sprzedaży i podatku VAT · {monthName}
        </p>
      </div>

      {/* KPI — cztery karty w jednym rzędzie, jak w prototypie */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[14px] border border-[var(--ff-border)] bg-[var(--ff-surface)] p-[22px]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--ff-surface-chip)] text-[var(--ff-text-muted)]">
              <span className="material-symbols-outlined text-[20px]">
                description
              </span>
            </div>
            <div className="text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.06em] text-[var(--ff-text-muted)]">
              Wystawione faktury
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold leading-none tracking-[-0.02em] text-[var(--ff-text-strong)] tabular-nums">
              {formatPlInt(issuedCount)}
            </span>
          </div>
          <p className="mt-3 text-xs text-[var(--ff-text-dim)]">
            <span
              className={
                momPositive
                  ? 'font-semibold text-[var(--ff-accent)]'
                  : 'font-semibold text-[var(--ff-danger)]'
              }
            >
              <span className="material-symbols-outlined mr-0.5 align-middle text-[12px]">
                {momPositive ? 'trending_up' : 'trending_down'}
              </span>
              {momPositive ? '+' : ''}
              {momPct}%
            </span>{' '}
            vs. poprzedni miesiąc: {formatPlInt(prevIssued)}
          </p>
        </div>

        <div className="rounded-[14px] border border-[var(--ff-border)] bg-[var(--ff-surface)] p-[22px]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--ff-surface-chip)] text-[var(--ff-text-muted)]">
              <span className="material-symbols-outlined text-[20px]">
                check_circle
              </span>
            </div>
            <div className="text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.06em] text-[var(--ff-text-muted)]">
              Zaakceptowane przez KSeF
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold leading-none tracking-[-0.02em] text-[var(--ff-text-strong)] tabular-nums">
              {formatPlInt(acceptedCount)}
            </span>
          </div>
          <p className="mt-3 text-xs text-[var(--ff-text-dim)]">
            z {formatPlInt(issuedCount)} wystawionych · {formatPlInt(pendingCount)}{' '}
            oczekuje
          </p>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--ff-surface-chip)]">
            <div
              className="h-full rounded-full bg-[var(--ff-accent)]"
              style={{ width: `${ksefPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-[14px] border border-[var(--ff-border)] bg-[var(--ff-surface)] p-[22px]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--ff-surface-chip)] text-[var(--ff-text-muted)]">
              <span className="material-symbols-outlined text-[20px]">
                credit_card
              </span>
            </div>
            <div className="text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.06em] text-[var(--ff-text-muted)]">
              VAT należny
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold leading-none tracking-[-0.02em] text-[var(--ff-text-strong)] tabular-nums">
              {formatPlMoney(totalVat)}
            </span>
            <span className="text-sm font-medium text-[var(--ff-text-dim)]">
              PLN
            </span>
          </div>
          <p className="mt-3 text-xs font-medium text-[var(--ff-warn)]">
            Termin: {vatDueLabel}
          </p>
        </div>

        <div className="rounded-[14px] border border-[var(--ff-border)] bg-[var(--ff-surface)] p-[22px]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--ff-surface-chip)] text-[var(--ff-text-muted)]">
              <span className="material-symbols-outlined text-[20px]">
                trending_up
              </span>
            </div>
            <div className="text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.06em] text-[var(--ff-text-muted)]">
              Sprzedaż brutto
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold leading-none tracking-[-0.02em] text-[var(--ff-text-strong)] tabular-nums">
              {formatPlMoney(totalGross)}
            </span>
            <span className="text-sm font-medium text-[var(--ff-text-dim)]">
              PLN
            </span>
          </div>
          {isBestYearMo ? (
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--ff-accent)]">
              <span className="material-symbols-outlined text-[12px]">
                arrow_upward
              </span>
              Najlepszy wynik w roku
            </p>
          ) : (
            <p className="mt-3 text-xs text-[var(--ff-text-dim)]">
              Suma brutto bieżącego miesiąca
            </p>
          )}
        </div>
      </div>

      {/* Podsumowanie VAT */}
      <div className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] px-8 py-[30px]">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--ff-text-strong)]">
              Podsumowanie podatku VAT
            </h2>
            <p className="mt-1.5 text-[13px] text-[var(--ff-text-muted)]">
              {monthName} · deklaracja JPK_V7
            </p>
          </div>
          <DashboardExportsPdfLink />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3">
          <div className="md:pr-7">
            <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--ff-text-muted)]">
              Netto
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[30px] font-bold leading-none text-[var(--ff-text-strong)] tabular-nums">
                {formatPlMoney(totalNet)}
              </span>
              <span className="text-sm text-[var(--ff-text-dim)]">PLN</span>
            </div>
          </div>
          <div className="mt-6 md:mt-0 md:border-l md:border-[var(--ff-border)] md:px-7">
            <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--ff-text-muted)]">
              VAT należny
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[30px] font-bold leading-none text-[var(--ff-warn)] tabular-nums">
                {formatPlMoney(totalVat)}
              </span>
              <span className="text-sm text-[var(--ff-text-dim)]">PLN</span>
            </div>
          </div>
          <div className="mt-6 md:mt-0 md:border-l md:border-[var(--ff-border)] md:px-7">
            <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--ff-text-muted)]">
              Brutto
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[30px] font-bold leading-none text-[var(--ff-text-strong)] tabular-nums">
                {formatPlMoney(totalGross)}
              </span>
              <span className="text-sm text-[var(--ff-text-dim)]">PLN</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2.5 rounded-[10px] border border-[var(--ff-warn-border)] bg-[var(--ff-warn-tint)] px-4 py-3 text-[13px] text-[var(--ff-warn)]">
          <span className="material-symbols-outlined text-[16px] leading-none">
            error
          </span>
          <span>
            Termin płatności VAT: <strong className="font-semibold">{vatDueLabel}</strong>{' '}
            — pozostało {daysToVatDue}{' '}
            {daysToVatDue === 1 ? 'dzień' : 'dni'}
          </span>
        </div>
      </div>

      {/* Wykres sprzedaży */}
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
            <span className="flex items-center gap-1.5 rounded-full bg-[#182029] px-3 py-1.5 text-xs text-[var(--ff-text)]">
              <span className="size-2 shrink-0 rounded-full bg-[var(--ff-accent)]" />
              {now.getFullYear()}
            </span>
            <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-[var(--ff-text-dim)]">
              <span className="size-2 shrink-0 rounded-full bg-[#3a4452]" />
              {now.getFullYear() - 1}
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
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
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
                    stroke="#1c2230"
                    strokeWidth="1"
                  />
                  <text
                    x={CHART_PAD - 10}
                    y={gy + 4}
                    textAnchor="end"
                    fill="#5b6472"
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
                stroke="#3a4452"
                strokeWidth="2"
                strokeDasharray="5 5"
              />
            ) : null}
            <path
              d={linePath(currentSeries)}
              fill="none"
              stroke="#34d399"
              strokeWidth="2.5"
            />
            {currentSeries.map((v, i) => (
              <circle
                key={chartMonths[i]!.key}
                cx={chartX(i)}
                cy={chartY(v)}
                r={4}
                fill="#12171f"
                stroke="#34d399"
                strokeWidth="2"
              />
            ))}
            {chartMonths.map((m, i) => (
              <text
                key={m.key}
                x={chartX(i)}
                y={CHART_H - 6}
                textAnchor="middle"
                fill={m.key === currentMonthKey ? '#34d399' : '#6b7585'}
                fontSize="12"
              >
                {m.label}
              </text>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
