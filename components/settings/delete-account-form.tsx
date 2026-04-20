'use client';

import { useState, useTransition } from 'react';

import { requestAccountDeletionAction } from '@/components/settings/account-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DeleteAccountFormProps {
  /** NIP tenanta (podpowiedź w etykiecie). */
  tenantNipHint: string;
}

export function DeleteAccountForm({ tenantNipHint }: DeleteAccountFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            const result = await requestAccountDeletionAction(formData);
            if (!result.success) setError(result.error);
          } catch (err: unknown) {
            if (
              typeof err === 'object' &&
              err !== null &&
              'digest' in err &&
              typeof (err as { digest?: unknown }).digest === 'string' &&
              String((err as { digest: string }).digest).startsWith(
                'NEXT_REDIRECT'
              )
            ) {
              return;
            }
            throw err;
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="nipConfirm">
          Wpisz NIP firmy ({tenantNipHint}), aby potwierdzić usunięcie
        </Label>
        <Input
          id="nipConfirm"
          name="nipConfirm"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="np. 1234567890"
          maxLength={13}
          required
          disabled={isPending}
          className="max-w-xs font-mono"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="destructive"
        disabled={isPending}
        className="w-full max-w-xs"
      >
        {isPending ? 'Przetwarzanie…' : 'Usuń konto'}
      </Button>
    </form>
  );
}
