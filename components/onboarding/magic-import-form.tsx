'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { startMagicImportAction } from '@/app/onboarding/magic-import/actions';

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
      <Link
        href="/onboarding/import-source"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Wybór źródła
      </Link>

      <div className="text-center space-y-3">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-purple-500 to-blue-500">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-display font-semibold tracking-tighter-display">
          Magiczny Import z KSeF
        </h1>
        <p className="text-muted-foreground">
          Pobierzemy Twoje faktury z KSeF i zbudujemy bazę kontrahentów oraz produktów
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2">
          Zakres importu
        </p>
        <div className="grid grid-cols-2 gap-3">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.months}
              type="button"
              onClick={() => setSelectedMonths(opt.months)}
              className={`rounded-2xl p-4 text-left transition-all duration-200 ease-apple active:scale-[0.97] ${
                selectedMonths === opt.months
                  ? 'bg-foreground text-background shadow-glass-sm'
                  : 'bg-glass-white border border-glass-border hover:bg-glass-white-strong'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Calendar className="h-4 w-4" />
                {opt.recommended && selectedMonths !== opt.months && (
                  <span className="text-[10px] uppercase tracking-wider opacity-60">
                    Zalecane
                  </span>
                )}
              </div>
              <p className="font-medium">{opt.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-foreground/5 p-4 text-sm text-muted-foreground leading-relaxed">
        Import zazwyczaj trwa <strong>30-90 sekund</strong>. Możesz zamknąć stronę — skończymy w
        tle.
      </div>

      <Button
        type="button"
        onClick={handleStart}
        variant="glass-primary"
        size="lg"
        className="w-full"
        disabled={isStarting}
      >
        {isStarting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Inicjalizujemy...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Rozpocznij Magiczny Import
          </>
        )}
      </Button>
    </div>
  );
}
