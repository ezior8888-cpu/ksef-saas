'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { changePasswordAction, type PasswordChangeResult } from '../actions';

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Sesja wygasła. Zaloguj się ponownie.',
  invalid_current: 'Aktualne hasło jest nieprawidłowe.',
  weak_password:
    'Nowe hasło nie spełnia wymagań (min 12, mała + duża litera, cyfra, znak specjalny).',
  password_breached:
    'To hasło pojawiło się w znanych wyciekach danych. Wybierz inne.',
  update_failed: 'Nie udało się zmienić hasła. Spróbuj ponownie.',
};

export function PasswordChangeCard() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<PasswordChangeResult | null>(null);

  function onSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const r = await changePasswordAction(formData);
      setResult(r);
    });
  }

  const errorMsg = result && !result.ok ? ERROR_MESSAGES[result.error] : null;
  const successMsg = result && result.ok ? 'Hasło zmienione.' : null;

  return (
    <form action={onSubmit} className="space-y-4">
      {successMsg && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      <div>
        <label
          htmlFor="current_password"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block"
        >
          Aktualne hasło
        </label>
        <Input
          id="current_password"
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      <div>
        <label
          htmlFor="new_password"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block"
        >
          Nowe hasło
        </label>
        <Input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Min. 12 znaków, mała + duża litera, cyfra, znak specjalny.
        </p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Zmiana...' : 'Zmień hasło'}
      </Button>
    </form>
  );
}
