'use client';

import { useState, useTransition } from 'react';

import { requestAccountDeletionAction } from '@/components/settings/account-actions';
import { Field, FieldContent, FieldLabel } from '@/components/settings/finora/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DeleteAccountFormProps {
  /** NIP tenanta (podpowiedź w etykiecie). */
  tenantNipHint: string;
}

/**
 * Usunięcie firmy. Wygląd: potwierdzenie jak w `privacy/delete-account-dialog.tsx`
 * Finory (pole z frazą do wpisania, przycisk destrukcyjny) — u nas frazą jest
 * NIP firmy, w miejscu, bez okna.
 */
export function DeleteAccountForm({ tenantNipHint }: DeleteAccountFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
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
      <Field data-invalid={error ? true : undefined}>
        <FieldContent>
          <FieldLabel htmlFor="nipConfirm">
            Wpisz NIP firmy ({tenantNipHint}), aby potwierdzić usunięcie
          </FieldLabel>
        </FieldContent>
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
        {error && (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        )}
      </Field>

      <div>
        <Button type="submit" variant="destructive" disabled={isPending}>
          {isPending ? 'Przetwarzanie…' : 'Usuń konto'}
        </Button>
      </div>
    </form>
  );
}
