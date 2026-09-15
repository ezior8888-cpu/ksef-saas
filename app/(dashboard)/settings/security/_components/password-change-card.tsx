'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  changePasswordAction,
  requestPasswordChangeNonceAction,
  type PasswordChangeResult,
} from '../actions';

const ERROR_MESSAGES: Record<Exclude<PasswordChangeResult, { ok: true }>['error'], string> = {
  not_authenticated: 'Sesja wygasła. Zaloguj się ponownie.',
  invalid_current: 'Aktualne hasło jest nieprawidłowe.',
  mfa_required: 'Potwierdź logowanie kodem z aplikacji 2FA i spróbuj ponownie.',
  verification_unavailable: 'Nie możemy teraz potwierdzić operacji. Spróbuj ponownie za chwilę.',
  weak_password: 'Nowe hasło musi mieć 12–128 znaków, małą i dużą literę, cyfrę oraz znak specjalny.',
  password_breached: 'To hasło pojawiło się w znanych wyciekach danych. Wybierz inne.',
  update_failed: 'Nie udało się zmienić hasła. Spróbuj ponownie.',
  reauthentication_needed: 'Zmiana hasła wymaga dodatkowego potwierdzenia. Wyślij kod i wpisz go poniżej.',
  invalid_nonce: 'Kod potwierdzenia jest nieprawidłowy lub wygasł. Wpisz go ponownie albo wyślij nowy kod.',
  same_password: 'Nowe hasło musi różnić się od aktualnego.',
  rate_limited: 'Zbyt wiele prób. Odczekaj przed kolejną próbą.',
  nonce_send_failed: 'Nie udało się wysłać kodu potwierdzenia. Spróbuj ponownie za chwilę.',
};

export function PasswordChangeCard() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<PasswordChangeResult | null>(null);
  const [needsNonce, setNeedsNonce] = useState(false);
  const [nonceSent, setNonceSent] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setResult(null);
    startTransition(async () => {
      try {
        const response = await changePasswordAction(data);
        setResult(response);
        if (response.ok) {
          // Native submit handling preserves fields on errors and clears secrets on success.
          form.reset();
          setNeedsNonce(false);
          setNonceSent(false);
        } else if (response.error === 'reauthentication_needed' || response.error === 'invalid_nonce') {
          setNeedsNonce(true);
        }
      } catch {
        setResult({ ok: false, error: 'verification_unavailable' });
      }
    });
  }

  function sendNonce() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData();
    data.set('current_password', new FormData(form).get('current_password') ?? '');
    setResult(null);
    setNonceSent(false);
    startTransition(async () => {
      try {
        const response = await requestPasswordChangeNonceAction(data);
        if (!response.ok) {
          setResult(response);
          return;
        }
        const input = form.elements.namedItem('nonce');
        if (input instanceof HTMLInputElement) input.value = '';
        setNonceSent(true);
      } catch {
        setResult({ ok: false, error: 'verification_unavailable' });
      }
    });
  }

  const failure = result && !result.ok ? result : null;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={isPending}>
      {result?.ok && (
        <div role="status" className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Hasło zmienione.
        </div>
      )}
      {failure && (
        <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {ERROR_MESSAGES[failure.error]}
          {failure.error === 'rate_limited' && failure.retryAfter && (
            <span> Spróbuj ponownie za {failure.retryAfter} s.</span>
          )}
        </div>
      )}

      <div>
        <label htmlFor="current_password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
          Aktualne hasło
        </label>
        <Input id="current_password" name="current_password" type="password" required maxLength={1024} autoComplete="current-password" />
      </div>

      <div>
        <label htmlFor="new_password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
          Nowe hasło
        </label>
        <Input id="new_password" name="new_password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        <p className="text-xs text-muted-foreground mt-1.5">
          12–128 znaków, mała i duża litera, cyfra oraz znak specjalny.
        </p>
      </div>

      {needsNonce && (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            Kod potwierdzenia wyślemy na adres e-mail lub numer telefonu przypisany do konta.
            To osobny kod do zmiany hasła.
          </p>
          <Button type="button" variant="outline" disabled={isPending} onClick={sendNonce}>
            {nonceSent ? 'Wyślij ponownie kod' : 'Wyślij kod potwierdzenia'}
          </Button>
          {nonceSent && (
            <p role="status" className="text-sm">
              Kod został wysłany. Ponowna wysyłka jest możliwa najwcześniej po minucie.
            </p>
          )}
          <div>
            <label htmlFor="nonce" className="text-sm font-medium">Kod potwierdzenia</label>
            <Input id="nonce" name="nonce" type="text" required minLength={6} maxLength={10} pattern="[0-9]{6,10}" inputMode="numeric" autoComplete="one-time-code" />
          </div>
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Proszę czekać...' : 'Zmień hasło'}
      </Button>
    </form>
  );
}
