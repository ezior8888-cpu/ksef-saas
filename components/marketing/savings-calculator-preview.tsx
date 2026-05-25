'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * Kalkulator oszczędności — dark+emerald glow. 2-col grid (inputy / wynik)
 * z subtelną emerald aurą wokół całej karty. Gigantyczna liczba zysku
 * w marketing-gradient-emerald.
 */
export function SavingsCalculatorPreview() {
  const [invoicesPerMonth, setInvoicesPerMonth] = useState(20);
  const [hourlyRate, setHourlyRate] = useState(150);
  const invoicesInputId = useId();
  const hourlyRateInputId = useId();

  const calc = useMemo(() => {
    const minutesPerInvoiceManual = 8;
    const minutesPerInvoiceWithOcr = 1.5;
    const savedMinutesPerInvoice =
      minutesPerInvoiceManual - minutesPerInvoiceWithOcr;

    const invoicesPerYear = invoicesPerMonth * 12;
    const minutesSavedPerYear = invoicesPerYear * savedMinutesPerInvoice;
    const hoursSavedPerYear = minutesSavedPerYear / 60;
    const moneySavedPerYear = hoursSavedPerYear * hourlyRate;

    const ksefSaasYear = 49 * 12;
    const competitorAvg = 79 * 12;

    const netSaving =
      moneySavedPerYear - ksefSaasYear + (competitorAvg - ksefSaasYear);

    return {
      hoursSavedPerYear,
      moneySavedPerYear,
      ksefSaasYear,
      competitorAvg,
      netSaving,
    };
  }, [invoicesPerMonth, hourlyRate]);

  return (
    <div className="relative">
      {/* Aura emerald wokół karty */}
      <div
        className="pointer-events-none absolute -inset-4 bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-emerald-500/20 opacity-50 blur-2xl"
        aria-hidden
      />
      <div className="marketing-glass-card relative overflow-hidden rounded-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* LEWA — sliderowe inputy */}
          <div className="space-y-8 border-b border-zinc-200 p-8 lg:border-b-0 lg:border-r lg:border-zinc-200 lg:p-10">
            <div>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <label
                  htmlFor={invoicesInputId}
                  className="text-sm font-medium text-zinc-900"
                >
                  Faktury miesięcznie
                </label>
                <span className="text-2xl font-bold tabular-nums text-emerald-700">
                  {invoicesPerMonth}
                </span>
              </div>
              <input
                id={invoicesInputId}
                type="range"
                min={5}
                max={200}
                step={5}
                value={invoicesPerMonth}
                onChange={(e) => setInvoicesPerMonth(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <label
                  htmlFor={hourlyRateInputId}
                  className="text-sm font-medium text-zinc-900"
                >
                  Stawka godzinowa (PLN)
                </label>
                <span className="text-2xl font-bold tabular-nums text-emerald-700">
                  {hourlyRate}
                </span>
              </div>
              <input
                id={hourlyRateInputId}
                type="range"
                min={30}
                max={500}
                step={10}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>
          </div>

          {/* PRAWA — gigantyczny zysk netto */}
          <div className="relative p-8 lg:p-10">
            {/* Subtelny emerald glow tła kolumny wyniku */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/[0.06] to-transparent" aria-hidden />
            <div className="relative">
              <p className="marketing-section-label">Zysk netto rocznie</p>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="text-6xl font-bold tabular-nums tracking-tight marketing-gradient-emerald lg:text-7xl">
                  {calc.netSaving.toFixed(0)}
                </span>
                <span className="text-2xl font-semibold text-zinc-600">
                  PLN
                </span>
              </p>

              <div className="mt-8 space-y-3 text-sm">
                <BreakdownRow
                  label="Czas wolny"
                  value={`${calc.hoursSavedPerYear.toFixed(0)} h / rok`}
                />
                <BreakdownRow
                  label="Wartość czasu"
                  value={`+${calc.moneySavedPerYear.toFixed(0)} PLN`}
                  positive
                />
                <BreakdownRow
                  label="Subskrypcja FaktFlow"
                  value={`−${calc.ksefSaasYear} PLN`}
                />
                <BreakdownRow
                  label="Przewaga rynkowa"
                  value="Wysoka"
                  positive
                  isLast
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 bg-zinc-100 p-6 lg:px-10">
          <p className="max-w-md text-xs text-zinc-600">
            Szacowanie na podstawie pomiarów beta-testerów: 8 min ręcznie vs 1,5
            min z OCR FaktFlow.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 shadow-[0_0_24px_-4px_var(--ff-emerald-glow)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_36px_0_var(--ff-emerald-glow)]"
          >
            Zacznij oszczędzać teraz
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  positive = false,
  isLast = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        isLast ? '' : 'border-b border-zinc-200 pb-3'
      }`}
    >
      <span className="text-zinc-600">{label}</span>
      <span
        className={`tabular-nums ${
          positive ? 'font-semibold text-emerald-700' : 'text-zinc-800'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
