'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import type { RolloutStage } from '@/lib/flo/rollout';

import { setRolloutStageAction } from '../actions';

/**
 * Trzy ruchy operatora przy jednej funkcji: odsłoń, rozwiń, schowaj.
 *
 * Werdykty liczy serwer (`canSetStage`) i podaje je tu gotowe. Przycisk
 * zablokowany zawsze mówi DLACZEGO — „rozwiń" wyszarzone bez powodu jest
 * gorsze niż jego brak, bo operator nie wie, czy czekać, czy coś naprawić.
 *
 * Akcja i tak sprawdza wszystko jeszcze raz. To, co tutaj, jest wygodą,
 * nie zabezpieczeniem: przeglądarka może wysłać, co chce.
 */

interface Props {
  kind: string;
  stage: RolloutStage;
  /** Etap, na który wolno rozwinąć; `null`, gdy nie wolno. */
  nextStage: RolloutStage | null;
  /** Dlaczego nie wolno rozwinąć — do pokazania przy wyszarzonym przycisku. */
  advanceBlocker: string | null;
}

export function RolloutControls({
  kind,
  stage,
  nextStage,
  advanceBlocker,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (target: RolloutStage) => {
    startTransition(async () => {
      const result = await setRolloutStageAction(kind, target);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const button =
    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
      ) : null}

      {stage === 0 ? (
        <button
          type="button"
          onClick={() => run(10)}
          disabled={isPending || advanceBlocker !== null}
          title={advanceBlocker ?? 'Pierwsze odsłonięcie: 10% kont'}
          className={cn(button, 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300')}
        >
          Odsłoń 10%
        </button>
      ) : null}

      {stage > 0 && stage < 100 ? (
        <button
          type="button"
          onClick={() => nextStage !== null && run(nextStage)}
          disabled={isPending || nextStage === null}
          title={advanceBlocker ?? `Rozwiń na ${nextStage}% kont`}
          className={cn(button, 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300')}
        >
          Rozwiń {nextStage !== null ? `do ${nextStage}%` : 'dalej'}
        </button>
      ) : null}

      {stage > 0 ? (
        // Schowanie nie ma warunków i nie ma potwierdzenia. Gdy operator
        // chce coś schować, zwykle właśnie dzieje się coś złego — to
        // najgorszy moment na dodatkowe okienko.
        <button
          type="button"
          onClick={() => run(0)}
          disabled={isPending}
          title="Schowaj przed wszystkimi kontami. Natychmiast, bez warunków."
          className={cn(button, 'border-destructive/40 text-destructive')}
        >
          Schowaj
        </button>
      ) : null}

      {advanceBlocker !== null ? (
        <span className="text-xs text-muted-foreground">{advanceBlocker}</span>
      ) : null}
    </div>
  );
}
