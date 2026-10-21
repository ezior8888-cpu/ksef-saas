'use client';

import { useState, useTransition } from 'react';

import { requestAccountDeletionAction } from '@/components/settings/account-actions';
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
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
        // Od 15.10.2026 akcja zawsze odmawia i kieruje do pomocy technicznej
        // (usuwanie firmy wstrzymane, NIP niczego nie odblokowuje), więc nie
        // przekierowuje i nie ma czego łapać.
        startTransition(async () => {
          const result = await requestAccountDeletionAction();
          setError(result.error);
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
          {/* Akcja usuwa firmę (organizację), nie konto użytkownika. */}
          {isPending ? 'Przetwarzanie…' : 'Usuń firmę'}
        </Button>
      </div>
    </form>
  );
}
