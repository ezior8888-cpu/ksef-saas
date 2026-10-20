'use client';

import { useState, useTransition } from 'react';
import { RiDeleteBinLine, RiErrorWarningLine, RiLoader4Line } from '@remixicon/react';
import { toast } from 'sonner';

import { requestAccountDeletionAction } from '@/components/settings/account-actions';
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * UWAGA (plan Finora P14, E10a): od E10a komponent NIE stoi na żadnym
 * ekranie — usunięcie firmy jest wyłącznie w „Konto i dane (RODO)”
 * (`DeleteAccountForm` na `/settings/account`). Plik zostaje, bo czyta go
 * `tests/unit/rodo-terminy-usuwania.test.ts`; wygląd przeniesiony na
 * prymitywy Finory, żeby w `components/settings` nie zostało szkło.
 */
export function DeleteAccountSection({ tenantNip }: { tenantNip: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, startDeleting] = useTransition();

  const normalizedNip = tenantNip.replace(/\D/g, '');
  const isConfirmValid = confirmInput === normalizedNip;

  const handleDelete = () => {
    if (!isConfirmValid) return;

    startDeleting(async () => {
      const formData = new FormData();
      formData.set('nipConfirm', confirmInput);
      const result = await requestAccountDeletionAction(formData);
      if ('success' in result && result.success === false) {
        toast.error(result.error);
      }
      // Sukces → redirect obsługuje akcja serwerowa (`/login?success=account_deleted`).
    });
  };

  if (!showConfirm) {
    return (
      <Button variant="destructive" onClick={() => setShowConfirm(true)}>
        <RiDeleteBinLine aria-hidden />
        Usuń konto
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <RiErrorWarningLine aria-hidden />
        <AlertTitle>Ta operacja jest nieodwracalna po 14 dniach.</AlertTitle>
        <AlertDescription>
          Wszystkie faktury, kontrahenci, certyfikaty i dane konta zostaną
          trwale usunięte. Faktury zachowane zgodnie z polityką retencji
          10 lat (RODO).
        </AlertDescription>
      </Alert>

      <Field>
        <FieldContent>
          <FieldLabel htmlFor="confirm-nip">
            Wpisz NIP firmy aby potwierdzić ({normalizedNip || '—'})
          </FieldLabel>
        </FieldContent>
        <Input
          id="confirm-nip"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value.replace(/\D/g, ''))}
          placeholder={normalizedNip}
          maxLength={10}
          className="font-mono"
        />
      </Field>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setShowConfirm(false);
            setConfirmInput('');
          }}
          disabled={isDeleting}
        >
          Anuluj
        </Button>
        <Button variant="destructive" onClick={handleDelete} disabled={!isConfirmValid || isDeleting}>
          {isDeleting ? (
            <>
              <RiLoader4Line className="animate-spin" aria-hidden />
              Usuwam...
            </>
          ) : (
            <>
              <RiDeleteBinLine aria-hidden />
              Potwierdź usunięcie konta
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
