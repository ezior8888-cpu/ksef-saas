'use client';

import { useTransition } from 'react';
import { ArrowRight, Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  plan: 'monthly' | 'annual';
  highlighted?: boolean;
  isPending: boolean;
  onSelect: (plan: 'monthly' | 'annual') => void;
}

function PlanCard({ plan, highlighted, isPending, onSelect }: PlanCardProps) {
  const isMonthly = plan === 'monthly';

  return (
    <div
      className={cn(
        'ff-glass-pane rounded-[var(--ff-radius-lg)] p-6 relative',
        highlighted
          ? 'border-emerald-500/40 bg-emerald-500/5 shadow-glass-lg'
          : 'border-glass-border',
      )}
    >
      {highlighted ? (
        <div className="absolute -top-3 right-6 rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white">
          <Sparkles className="mr-1 inline h-3 w-3" />
          Oszczędzasz 20%
        </div>
      ) : null}

      <h3 className="font-display text-2xl font-semibold tracking-tighter-display">
        {isMonthly ? 'Miesięcznie' : 'Rocznie'}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {isMonthly
          ? 'Płać co miesiąc, anuluj kiedy chcesz'
          : '2 miesiące w prezencie · 1 płatność rocznie'}
      </p>

      <div className="mt-6 flex items-baseline gap-1">
        <p className="font-display text-5xl font-bold tracking-tighter-display">
          {isMonthly ? '59' : '49'}
          <span className="ml-1 text-lg font-normal text-muted-foreground">
            zł / mc
          </span>
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {isMonthly ? '+ VAT 23%' : `588 zł / rok + VAT 23%`}
      </p>

      <Button
        size="lg"
        variant={highlighted ? 'glass-primary' : 'glass'}
        className="mt-6 w-full"
        disabled={isPending}
        onClick={() => onSelect(plan)}
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Zacznij 30 dni za darmo
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>

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

  const handleSelect = (plan: 'monthly' | 'annual') => {
    startTransition(async () => {
      try {
        await startCheckoutAction(plan);
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
    <div className="grid gap-6 md:grid-cols-2">
      <PlanCard
        plan="monthly"
        isPending={isPending}
        onSelect={handleSelect}
      />
      <PlanCard
        plan="annual"
        highlighted
        isPending={isPending}
        onSelect={handleSelect}
      />
    </div>
  );
}
