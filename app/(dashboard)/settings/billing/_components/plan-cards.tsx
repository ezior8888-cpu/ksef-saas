'use client';

import { useTransition } from 'react';
import { ArrowRight, Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PRICE_GROSS, PRICE_NET, TRIAL_DAYS } from '@/lib/billing/pricing';

import { startCheckoutAction } from '../actions';

const FEATURES = [
  'Faktury sprzedaż + zakupy bez limitu',
  'OCR z auto-kategoryzacją KPiR',
  'KSeF 2.0 + UPO + walidacja',
  'Wkurzacz Dłużników',
  'Magiczny import z konkurencji',
  'Co-Pilot Księgowego',
  'PWA mobilna z OCR',
  'Wsparcie po polsku',
];

interface PlanCardProps {
  isPending: boolean;
  onSelect: () => void;
}

/**
 * Jeden plan miesięczny (decyzja z 1 października 2026, lib/billing/pricing.ts).
 * Plan roczny nie jest sprzedawany — akcja zakupu też go odrzuca.
 */
function PlanCard({ isPending, onSelect }: PlanCardProps) {
  return (
    <div className="ff-glass-pane relative rounded-[var(--ff-radius-lg)] border-emerald-500/40 bg-emerald-500/5 p-6 shadow-glass-lg">
      <div className="absolute -top-3 right-6 rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white">
        <Sparkles className="mr-1 inline h-3 w-3" />
        {TRIAL_DAYS} dni za darmo
      </div>

      <h3 className="font-display text-2xl font-semibold tracking-tighter-display">
        Miesięcznie
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Płać co miesiąc, anuluj kiedy chcesz
      </p>

      <div className="mt-6 flex items-baseline gap-1">
        <p className="font-display text-5xl font-bold tracking-tighter-display">
          {PRICE_GROSS}
          <span className="ml-1 text-lg font-normal text-muted-foreground">
            / mc
          </span>
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        z VAT · {PRICE_NET} netto
      </p>

      <Button
        size="lg"
        variant="glass-primary"
        className="mt-6 w-full"
        disabled={isPending}
        onClick={onSelect}
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Zacznij {TRIAL_DAYS} dni za darmo
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Kartę podajesz teraz, pierwsza płatność po {TRIAL_DAYS} dniach.
      </p>

      <ul className="mt-6 space-y-2">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="text-muted-foreground">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanCards() {
  const [isPending, startTransition] = useTransition();

  const handleSelect = () => {
    startTransition(async () => {
      try {
        await startCheckoutAction('monthly');
        // `startCheckoutAction` rzuca NEXT_REDIRECT — kod tu nie dotrze przy
        // sukcesie. Toast wyląduje gdy redirect wróci z `?error=...`.
      } catch (e) {
        // NEXT_REDIRECT to NIE jest błąd — Next.js re-throws go w server actions.
        // Inny rzut = realny problem.
        const err = e as Error;
        if (err.message?.includes('NEXT_REDIRECT')) return;
        toast.error('Nie udało się rozpocząć subskrypcji. Spróbuj ponownie.');
      }
    });
  };

  return (
    <div className="max-w-md">
      <PlanCard isPending={isPending} onSelect={handleSelect} />
    </div>
  );
}
