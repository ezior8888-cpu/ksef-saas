'use client';

import { useTransition } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { openCustomerPortalAction } from '../actions';

interface Props {
  disabled?: boolean;
}

/**
 * Przycisk otwierający Stripe Customer Portal w nowym tabie. Klient sam
 * zmienia plan/kartę/anuluje, my dostajemy webhook'a i synchronizujemy
 * lokalną subscription.
 */
export function PortalButton({ disabled }: Props) {
  const [isPending, startTransition] = useTransition();

  const handle = () => {
    startTransition(async () => {
      try {
        await openCustomerPortalAction();
      } catch (e) {
        const err = e as Error;
        if (err.message?.includes('NEXT_REDIRECT')) return;
        toast.error('Nie udało się otworzyć portalu. Spróbuj ponownie.');
      }
    });
  };

  return (
    <Button
      variant="glass"
      size="sm"
      onClick={handle}
      disabled={disabled || isPending}
    >
      {isPending ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <ExternalLink className="mr-2 h-3.5 w-3.5" />
      )}
      Zarządzaj subskrypcją
    </Button>
  );
}
