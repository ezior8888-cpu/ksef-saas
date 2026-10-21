'use client';

// Plan Finora P15 (E10b): zakres Magicznego importu na prymitywach Finory
// (`Button`, ramki kart, ikony Remix) zamiast szkła i gradientu. Logika bez
// zmian: `startMagicImportAction`, potem strona postępu.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { RiArrowLeftLine, RiCalendarLine, RiLoader4Line, RiSparkling2Line } from '@remixicon/react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { startMagicImportAction } from '@/app/onboarding/magic-import/actions';
import { cn } from '@/lib/utils';

const RANGE_OPTIONS = [
  { months: 3, label: '3 miesiące' },
  { months: 6, label: '6 miesięcy', recommended: true },
  { months: 12, label: '12 miesięcy' },
  { months: 24, label: '2 lata (max)' },
];

export function MagicImportForm({ tenantId }: { tenantId: string }) {
  const [selectedMonths, setSelectedMonths] = useState(6);
  const [isStarting, startImport] = useTransition();

  const handleStart = () => {
    startImport(async () => {
      const result = await startMagicImportAction(tenantId, selectedMonths);
      if (result.success) {
        window.location.assign(`/onboarding/progress/${result.importJobId}`);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        className="group w-fit text-muted-foreground"
        render={<Link href="/onboarding/import-source" />}
        nativeButton={false}
      >
        <RiArrowLeftLine className="transition-transform duration-200 group-hover:-translate-x-0.5" />
        Wybór źródła
      </Button>

      <div className="space-y-3">
        <div className="flex size-12 items-center justify-center bg-primary/10 text-primary">
          <RiSparkling2Line className="size-6" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold">Magiczny Import z KSeF</h1>
        <p className="text-muted-foreground">
          Pobierzemy Twoje faktury z KSeF i zbudujemy bazę kontrahentów oraz produktów
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Zakres importu</p>
        <div className="grid grid-cols-2 gap-3">
          {RANGE_OPTIONS.map((opt) => {
            const selected = selectedMonths === opt.months;
            return (
              <button
                key={opt.months}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedMonths(opt.months)}
                className={cn(
                  'border p-3 text-left transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-muted',
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <RiCalendarLine className="size-4" />
                  {opt.recommended && !selected && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Zalecane
                    </span>
                  )}
                </div>
                <p className="font-medium">{opt.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      <p className="border bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">
        Import zazwyczaj trwa <strong>30-90 sekund</strong>. Możesz zamknąć stronę — skończymy w
        tle.
      </p>

      <Button
        type="button"
        onClick={handleStart}
        size="lg"
        className="w-full"
        disabled={isStarting}
      >
        {isStarting ? (
          <>
            <RiLoader4Line className="animate-spin" />
            Inicjalizujemy...
          </>
        ) : (
          <>
            <RiSparkling2Line />
            Rozpocznij Magiczny Import
          </>
        )}
      </Button>
    </div>
  );
}
