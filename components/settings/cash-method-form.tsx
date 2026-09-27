'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { updateCashMethodAction } from '@/app/actions/cash-method';
import { Button } from '@/components/ui/button';

/**
 * Metoda kasowa VAT firmy. Na każdej fakturze: P_16 = 1 w KSeF i wyrazy
 * „metoda kasowa” (art. 106e ust. 1 pkt 16).
 */
export function CashMethodForm({
  initialEnabled,
  canEdit,
}: {
  initialEnabled: boolean;
  /** Właściciel i administrator; pozostali widzą stan bez możliwości zmiany. */
  canEdit: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await updateCashMethodAction(enabled);
      if (result.success) {
        toast.success(result.enabled ? 'Metoda kasowa włączona' : 'Metoda memoriałowa (bez metody kasowej)');
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit || pending}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        Rozliczam VAT metodą kasową
      </label>
      <p className="text-xs text-muted-foreground">
        Dla małych podatników VAT, którzy wybrali metodę kasową (art. 21 ustawy o VAT). Każda faktura dostanie
        wtedy wymagane wyrazy „metoda kasowa”. Nie dotyczy firm zwolnionych z VAT.
      </p>
      {canEdit ? (
        <Button type="button" onClick={save} disabled={pending} className="gap-2" variant="outline">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz metodę rozliczania
        </Button>
      ) : null}
    </div>
  );
}
