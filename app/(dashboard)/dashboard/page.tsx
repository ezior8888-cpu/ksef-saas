import Image from 'next/image';

import { createClient } from '@/lib/supabase/server';
import { DashboardExportsPdfLink } from '@/components/dashboard/exports-route-client';
import { FF_DASHBOARD_DECOR_IMG } from '@/components/dashboard/ff-assets';

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

function smoothLinePath(
  pts: Array<{ x: number; y: number }>,
): { lineD: string; areaD: string } {
  if (pts.length === 0) {
    return { lineD: '', areaD: '' };
  }
  if (pts.length === 1) {
    const p = pts[0];
    return {
      lineD: `M ${p.x},${p.y}`,
      areaD: `M ${p.x},${p.y} L 1000,300 L 0,300 Z`,
    };
  }
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const c1x = p0.x + (p1.x - p0.x) / 3;
    const c1y = p0.y;
    const c2x = p0.x + (2 * (p1.x - p0.x)) / 3;
    const c2y = p1.y;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p1.x},${p1.y}`;
  }
  const bottomY = 300;
  const areaD = `${d} L 1000,${bottomY} L 0,${bottomY} Z`;
  return { lineD: d, areaD };
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
  const totalNet =
    monthInvoices?.reduce((sum, i) => sum + Number(i.net_total ?? 0), 0) ?? 0;
  const totalVat =
    monthInvoices?.reduce((sum, i) => sum + Number(i.vat_total ?? 0), 0) ?? 0;
  const totalGross =
    monthInvoices?.reduce((sum, i) => sum + Number(i.gross_total ?? 0), 0) ?? 0;

  /** 6 miesięcy kalendarzowych jak na osi wykresu (najstarszy = bieżący − 5). */
  const chartMonths: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const raw = d
      .toLocaleDateString('pl-PL', { month: 'short' })
      .replace(/\./g, '')
      .trim();
    const label = raw.toUpperCase();
    chartMonths.push({ key, label });
  }
  const chartWindowStartIso = `${chartMonths[0]!.key}-01`;

  const { data: yearInvoices } = await supabase
    .from('invoices')
    .select('gross_total, issue_date')
    .eq('direction', 'issued')
    .gte('issue_date', chartWindowStartIso);

  const monthlyData = new Map<string, number>();
  yearInvoices?.forEach((inv) => {
    const key = inv.issue_date.slice(0, 7);
    monthlyData.set(
      key,
      (monthlyData.get(key) ?? 0) + Number(inv.gross_total ?? 0),
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

  const ksefPct =
    issuedCount > 0 ? Math.min(100, Math.round((acceptedCount / issuedCount) * 100)) : 0;

  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const chartValues = chartMonths.map((m) => monthlyData.get(m.key) ?? 0);
  const chartMax = Math.max(...chartValues, 1);
  const w = 1000;
  const bottomY = 280;
  const topY = 40;
  const pts = chartValues.map((v, i) => ({
    x: chartValues.length === 1 ? w / 2 : (i / (chartValues.length - 1)) * w,
    y: bottomY - (v / chartMax) * (bottomY - topY),
  }));
  const { lineD, areaD } = smoothLinePath(pts);
  const chartAreaGradientId = `ff-dash-area-${chartMonths.map((m) => m.key).join('-')}`;

  return (
    <div className="pb-10 text-[var(--ff-on-surface)]">
      <div className="mb-10">
        <h2 className="mb-1 text-[40px] font-bold leading-[1.2] tracking-[-0.02em]">
          Dashboard
        </h2>
        <p className="text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
          Zestawienia sprzedaży i podatku VAT • {monthName}
        </p>
      </div>

      <div
        className="mb-[var(--ff-gutter)] grid grid-cols-1 gap-[var(--ff-gutter)] md:grid-cols-2 lg:grid-cols-4"
      >
        <div className="ff-glass-pane ff-glass-pane-hover group relative overflow-hidden rounded-[var(--ff-radius-lg)] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-primary)_20%,transparent)]">
              <span className="material-symbols-outlined text-[22px] text-[var(--ff-primary)]">
                description
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_90%,transparent)]">
              Wystawione faktury
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[48px] font-bold leading-none tabular-nums">
              {formatPlInt(issuedCount)}
            </span>
            <span
              className={`flex items-center gap-0.5 text-sm font-bold ${
                momPositive ? 'text-[var(--ff-primary)]' : 'text-red-400'
              }`}
            >
              {momPositive ? '+' : ''}
              {momPct}%
              <span className="material-symbols-outlined text-[14px]">
                {momPositive ? 'trending_up' : 'trending_down'}
              </span>
            </span>
          </div>
          <p className="mt-2 text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_40%,transparent)]">
            Poprzedni miesiąc: {formatPlInt(prevIssued)}
          </p>
        </div>

        <div className="ff-glass-pane ff-glass-pane-hover group relative overflow-hidden rounded-[var(--ff-radius-lg)] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-primary)_20%,transparent)]">
              <span className="material-symbols-outlined ff-ms-fill text-[22px] text-[var(--ff-primary)]">
                check_circle
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_90%,transparent)]">
              Zaakceptowane przez KSeF
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[48px] font-bold leading-none tabular-nums">
              {formatPlInt(acceptedCount)}
            </span>
            <span className="text-sm font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_40%,transparent)]">
              z {formatPlInt(issuedCount)} wystawionych
            </span>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-[var(--ff-primary)] shadow-[0_0_8px_rgba(107,251,154,0.6)]"
              style={{ width: `${ksefPct}%` }}
            />
          </div>
        </div>

        <div className="ff-glass-pane ff-glass-pane-hover group relative overflow-hidden rounded-[var(--ff-radius-lg)] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-secondary)_20%,transparent)]">
              <span className="material-symbols-outlined text-[22px] text-[var(--ff-secondary)]">
                payments
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_90%,transparent)]">
              Suma VAT
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold leading-none tabular-nums">
              {formatPlMoney(totalVat)}
            </span>
            <span className="text-sm font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]">
              PLN
            </span>
          </div>
          <p className="mt-2 text-[12px] font-bold text-[var(--ff-secondary)]">
            Należny do {vatDueLabel}
          </p>
        </div>

        <div className="ff-glass-pane ff-glass-pane-hover group relative overflow-hidden rounded-[var(--ff-radius-lg)] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-tertiary)_20%,transparent)]">
              <span className="material-symbols-outlined text-[22px] text-[var(--ff-tertiary)]">
                trending_up
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_90%,transparent)]">
              Sprzedaż Brutto
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold leading-none tabular-nums">
              {formatPlMoney(totalGross)}
            </span>
            <span className="text-sm font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]">
              PLN
            </span>
          </div>
          {isBestYearMo ? (
            <p className="mt-2 flex items-center gap-1 text-[12px] font-bold text-[var(--ff-primary)]">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              Najlepszy wynik w roku
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
              Suma brutto bieżącego miesiąca
            </p>
          )}
        </div>
      </div>

      <div className="ff-glass-pane relative mb-[var(--ff-gutter)] min-h-[240px] overflow-hidden rounded-[var(--ff-radius-lg)] p-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="mb-1 text-2xl font-bold leading-snug tracking-tight">
              Podsumowanie podatku VAT
            </h3>
            <p className="text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
              {monthName}
            </p>
          </div>
          <DashboardExportsPdfLink />
        </div>
        <div className="relative z-10 grid grid-cols-1 gap-12 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_40%,transparent)]">
              Netto
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[40px] font-bold leading-none tabular-nums">
                {formatPlMoney(totalNet)}
              </span>
              <span className="text-base font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]">
                PLN
              </span>
            </div>
          </div>
          <div className="relative flex flex-col gap-2">
            <div className="absolute left-0 top-1/2 hidden h-12 w-px -translate-x-6 -translate-y-1/2 bg-[var(--ff-outline-soft)] md:block" />
            <span className="text-[12px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_40%,transparent)]">
              VAT
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[40px] font-bold leading-none text-[var(--ff-secondary)] tabular-nums">
                {formatPlMoney(totalVat)}
              </span>
              <span className="text-base font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]">
                PLN
              </span>
            </div>
          </div>
          <div className="relative flex flex-col gap-2">
            <div className="absolute left-0 top-1/2 hidden h-12 w-px -translate-x-6 -translate-y-1/2 bg-[var(--ff-outline-soft)] md:block" />
            <span className="text-[12px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_40%,transparent)]">
              Brutto
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[40px] font-bold leading-none tabular-nums">
                {formatPlMoney(totalGross)}
              </span>
              <span className="text-base font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]">
                PLN
              </span>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-1/3 opacity-20">
          <Image
            src={FF_DASHBOARD_DECOR_IMG}
            alt=""
            fill
            className="object-cover [mask-image:linear-gradient(to_left,black,transparent)]"
            sizes="(max-width: 1400px) 33vw, 400px"
            priority
          />
        </div>
      </div>

      <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] p-8">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="mb-1 text-2xl font-bold leading-snug tracking-tight">
              Sprzedaż w ostatnich 6 miesiącach
            </h3>
            <p className="text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
              Sumaryczna kwota brutto wystawionych faktur
            </p>
          </div>
          <div className="flex gap-2">
            <div className="ff-glass-pane flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--ff-primary)]" />
              {now.getFullYear()}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/5 px-3 py-1.5 text-[11px] font-bold opacity-40">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--ff-on-surface-variant)]" />
              {now.getFullYear() - 1}
            </div>
          </div>
        </div>

        {chartValues.every((v) => v === 0) ? (
          <p className="mb-2 text-center text-xs text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Brak faktur w tym okresie — linia pokazuje skalę miesięcy
          </p>
        ) : null}
        <div className="relative h-[300px] w-full">
          <svg
            className="h-full w-full overflow-visible"
            viewBox="0 0 1000 300"
            preserveAspectRatio="none"
            role="img"
            aria-label="Wykres sprzedaży brutto ostatnich 6 miesięcy"
          >
              <line
                x1="0"
                x2="1000"
                y1="50"
                y2="50"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
              />
              <line
                x1="0"
                x2="1000"
                y1="125"
                y2="125"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
              />
              <line
                x1="0"
                x2="1000"
                y1="200"
                y2="200"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
              />
              <defs>
                <linearGradient id={chartAreaGradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#6bfb9a" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#6bfb9a" stopOpacity="0" />
                </linearGradient>
              </defs>
              {areaD ? <path d={areaD} fill={`url(#${chartAreaGradientId})`} /> : null}
              {lineD ? (
                <path
                  className="ff-chart-glow"
                  d={lineD}
                  fill="none"
                  stroke="#6bfb9a"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              ) : null}
              {pts.map((p, idx) => (
                <circle
                  key={chartMonths[idx]?.key ?? `p-${idx}`}
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  fill="var(--ff-primary)"
                  stroke="var(--ff-bg)"
                  strokeWidth="2"
                />
              ))}
            </svg>
            <div className="mt-4 flex justify-between px-2">
              {chartMonths.map((m) => (
                <span
                  key={m.key}
                  className={
                    m.key === currentMonthKey
                      ? 'text-[11px] font-bold text-[var(--ff-primary)]'
                      : 'text-[11px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_40%,transparent)]'
                  }
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>
      </div>

      <div className="pointer-events-none mb-10 mt-12 text-center opacity-20">
        <p className="text-[10px] font-bold uppercase tracking-widest">
          FaktFlow Integrated Financial Core v4.2
        </p>
      </div>
    </div>
  );
}
