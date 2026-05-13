'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';

export function LandingCalculatorEmerald() {
  const [invoicesPerMonth, setInvoicesPerMonth] = useState(20);
  const [hourlyRate, setHourlyRate] = useState(150);
  const invoicesInputId = useId();
  const hourlyRateInputId = useId();

  const calc = useMemo(() => {
    const minutesPerInvoiceManual = 8;
    const minutesPerInvoiceWithOcr = 1.5;
    const savedMinutesPerInvoice = minutesPerInvoiceManual - minutesPerInvoiceWithOcr;
    const invoicesPerYear = invoicesPerMonth * 12;
    const minutesSavedPerYear = invoicesPerYear * savedMinutesPerInvoice;
    const hoursSavedPerYear = minutesSavedPerYear / 60;
    const moneySavedPerYear = hoursSavedPerYear * hourlyRate;
    const ksefSaasYear = 49 * 12;
    const competitorAvg = 79 * 12;
    const netSaving = moneySavedPerYear - ksefSaasYear + (competitorAvg - ksefSaasYear);
    return {
      hoursSavedPerYear,
      moneySavedPerYear,
      ksefSaasYear,
      competitorAvg,
      netSaving,
    };
  }, [invoicesPerMonth, hourlyRate]);

  const netRounded = Math.round(calc.netSaving);

  return (
    <div className="ff-landing-glass-panel relative overflow-hidden rounded-3xl p-8 shadow-2xl md:p-14">
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-[var(--ml-primary)]/10 blur-3xl" />
      <div className="relative z-10 grid items-center gap-16 md:grid-cols-2">
        <div className="space-y-12">
          <div>
            <div className="mb-6 flex items-center justify-between">
              <label
                htmlFor={invoicesInputId}
                className="font-semibold text-[var(--ml-on-surface)]"
              >
                Faktury miesięcznie
              </label>
              <span className="text-2xl font-bold tabular-nums text-[var(--ml-primary)]">
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
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--ml-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--ml-on-surface-variant)]">
              Wystawione + zakupowe + paragony
            </p>
          </div>
          <div>
            <div className="mb-6 flex items-center justify-between">
              <label
                htmlFor={hourlyRateInputId}
                className="font-semibold text-[var(--ml-on-surface)]"
              >
                Stawka godzinowa (PLN)
              </label>
              <span className="text-2xl font-bold tabular-nums text-[var(--ml-primary)]">
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
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--ml-primary)]"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-10 text-center shadow-inner">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ml-on-surface-variant)] opacity-40">
            Zysk netto rocznie
          </span>
          <div className="ff-landing-emerald-text-glow mb-6 text-[56px] font-bold leading-none text-[var(--ml-primary)] md:text-[72px]">
            {netRounded}
            <span className="ml-2 text-xl font-normal opacity-50">PLN</span>
          </div>
          <div className="space-y-4 border-t border-white/5 pt-8 text-left text-sm">
            <div className="flex justify-between">
              <span className="opacity-50">Czas wolny</span>
              <span className="font-bold tabular-nums">
                {calc.hoursSavedPerYear.toFixed(0)} h / rok
              </span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-50">Wartość czasu</span>
              <span className="font-bold text-[var(--ml-primary)] tabular-nums">
                +{calc.moneySavedPerYear.toFixed(0)} PLN
              </span>
            </div>
            <div className="flex justify-between font-bold text-[var(--ml-primary)]/80">
              <span>vs średnia konkurencji</span>
              <span className="tabular-nums">
                +{(calc.competitorAvg - calc.ksefSaasYear).toFixed(0)} PLN
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-14 flex flex-col items-center justify-between gap-8 border-t border-white/5 pt-10 md:flex-row">
        <p className="max-w-sm text-[11px] italic leading-relaxed text-[var(--ml-on-surface-variant)] opacity-40">
          Szacunek na podstawie pomiarów beta-testerów: 8 min ręcznie vs 1,5 min z OCR FaktFlow.
        </p>
        <Link
          href="/register"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--ml-primary)] px-10 py-4 text-sm font-bold text-[var(--ml-on-primary)] shadow-[0_0_20px_rgba(78,222,163,0.35)] transition-transform hover:scale-[0.98]"
        >
          Zacznij oszczędzać teraz
        </Link>
      </div>
    </div>
  );
}
