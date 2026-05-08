'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function SavingsCalculatorPreview() {
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

  return (
    <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass-lg p-8 lg:p-10">
      <div className="mb-8 grid gap-8 md:grid-cols-2">
        <div className="space-y-6">
          <div>
            <label htmlFor={invoicesInputId} className="mb-2 block text-sm font-medium">
              Liczba faktur miesięcznie
            </label>
            <div className="flex items-center gap-4">
              <input
                id={invoicesInputId}
                type="range"
                min={5}
                max={200}
                step={5}
                value={invoicesPerMonth}
                onChange={(e) => setInvoicesPerMonth(Number(e.target.value))}
                className="flex-1 accent-foreground"
              />
              <div className="w-16 text-right font-display text-lg font-semibold tabular-nums">
                {invoicesPerMonth}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Wystawione + zakupowe + paragony</p>
          </div>

          <div>
            <label htmlFor={hourlyRateInputId} className="mb-2 block text-sm font-medium">
              Twoja stawka godzinowa (PLN)
            </label>
            <div className="flex items-center gap-4">
              <input
                id={hourlyRateInputId}
                type="range"
                min={30}
                max={500}
                step={10}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="flex-1 accent-foreground"
              />
              <div className="w-16 text-right font-display text-lg font-semibold tabular-nums">
                {hourlyRate}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Ile bierzesz za godzinę pracy</p>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-2xl border border-glass-border bg-foreground/3 p-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Twoja oszczędność netto rocznie
          </p>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="font-display text-5xl font-bold tabular-nums tracking-tighter-display">
              {calc.netSaving.toFixed(0)}
            </span>
            <span className="text-2xl text-muted-foreground">PLN</span>
          </div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Czas zaoszczędzony</span>
              <span className="tabular-nums">{calc.hoursSavedPerYear.toFixed(0)} h/rok</span>
            </div>
            <div className="flex justify-between">
              <span>Wartość Twojego czasu</span>
              <span className="tabular-nums">+{calc.moneySavedPerYear.toFixed(0)} PLN</span>
            </div>
            <div className="flex justify-between">
              <span>Subskrypcja KSeF SaaS</span>
              <span className="tabular-nums">−{calc.ksefSaasYear} PLN</span>
            </div>
            <div className="flex justify-between text-green-700 dark:text-green-400">
              <span>vs. średnia konkurencji</span>
              <span className="tabular-nums">
                +{(calc.competitorAvg - calc.ksefSaasYear).toFixed(0)} PLN
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-glass-border pt-6">
        <p className="max-w-md text-xs text-muted-foreground">
          Szacunek na podstawie pomiarów beta-testerów: 8 min ręcznego wpisania faktury vs 1.5 min z
          OCR. Twoje rezultaty mogą się różnić.
        </p>
        <Button variant="glass-primary" asChild>
          <Link href="/register" className="inline-flex items-center">
            Wypróbuj 30 dni za darmo
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
