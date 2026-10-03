'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, RotateCcw, SearchCheck, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { operatorInvoiceButtons, type OperatorButtonsInput } from '@/lib/admin/ksef-operator-policy';

import { operatorRequeueAction, operatorResetAction } from '../actions';

interface Props extends OperatorButtonsInput {
  invoiceId: string;
  internalNumber: string | null;
}

/** Przyciski operatora: te same RPC co u klienta, z aktorem = operator (PR 3c). */
export function OperatorActions(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const buttons = operatorInvoiceButtons(props);
  const label = props.internalNumber ?? props.invoiceId;

  const run = (confirmText: string, fn: () => Promise<{ success: true; message: string } | { success: false; error: string }>) => {
    if (!window.confirm(confirmText)) return;
    start(async () => {
      const result = await fn();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => run(`Wysłać ponownie fakturę ${label}? Worker zacznie od uzgodnienia po referencji.`, () =>
            operatorRequeueAction(props.invoiceId, { reconcileOnly: false }))}
          disabled={pending || !buttons.requeue.enabled}
          title={buttons.requeue.reason ?? undefined}
        >
          {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Wyślij ponownie
        </Button>
        <Button
          variant="outline"
          onClick={() => run(`Tylko uzgodnić fakturę ${label} po numerze referencyjnym (bez nowej wysyłki)?`, () =>
            operatorRequeueAction(props.invoiceId, { reconcileOnly: true }))}
          disabled={pending || !buttons.reconcile.enabled}
          title={buttons.reconcile.reason ?? undefined}
        >
          <SearchCheck className="h-4 w-4 mr-2" />
          Tylko uzgodnij
        </Button>
        <Button
          variant="outline"
          onClick={() => run(`Przywrócić fakturę ${label} do szkicu? Dane wysyłki zostaną wyczyszczone (poprzednie wartości trafią do audytu).`, () =>
            operatorResetAction(props.invoiceId))}
          disabled={pending || !buttons.reset.enabled}
          title={buttons.reset.reason ?? undefined}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Wróć do szkicu
        </Button>
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {(['requeue', 'reconcile', 'reset'] as const)
          .filter((key) => buttons[key].reason)
          .map((key) => (
            <li key={key}>
              <span className="font-medium">
                {key === 'requeue' ? 'Wyślij ponownie' : key === 'reconcile' ? 'Tylko uzgodnij' : 'Wróć do szkicu'}
              </span>
              {': '}
              {buttons[key].reason}
            </li>
          ))}
      </ul>
    </div>
  );
}
