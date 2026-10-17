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
        // Od 15.10.2026 akcja zawsze odmawia i kieruje do pomocy technicznej
        // (usuwanie firmy wstrzymane, NIP niczego nie odblokowuje), więc nie
        // przekierowuje i nie ma czego łapać.
        startTransition(async () => {
          const result = await requestAccountDeletionAction();
          setError(result.error);
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
        {/* Akcja usuwa firmę (organizację), nie konto użytkownika. */}
        {isPending ? 'Przetwarzanie…' : 'Usuń firmę'}
      </Button>
    </form>
  );
}
