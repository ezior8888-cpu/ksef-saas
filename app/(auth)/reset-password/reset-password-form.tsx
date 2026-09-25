'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authAlertErrorClass, authAlertSuccessClass, authInputClass, authLabelClass, authLinkClass, authPrimaryButtonClass } from '@/components/auth/auth-form-styles';
import { resetPasswordAction } from './actions';

const ERRORS = {
  invalid_link: 'Potwierdzenie odzyskiwania wygasło. Poproś o nowy link.',
  mfa_required: 'Potwierdź drugi składnik, zanim zmienisz hasło.',
  weak_password: 'Użyj od 12 do 128 znaków, małej i wielkiej litery, cyfry oraz znaku specjalnego.',
  password_breached: 'To hasło występuje w znanych wyciekach. Wybierz inne.',
  password_mismatch: 'Wpisane hasła różnią się.',
  rate_limited: 'Zbyt wiele prób. Poczekaj kilka minut.',
  verification_unavailable: 'Nie możemy teraz bezpiecznie wykonać operacji. Spróbuj ponownie za chwilę.',
  restart_required: 'Potwierdzenie zostało wykorzystane lub zapis nie został potwierdzony. Poproś o nowy link.',
} as const;

export function ResetPasswordForm() {
  const [result, action, pending] = useActionState(resetPasswordAction, null);
  if (result?.ok) {
    return (
      <div role="status" className="space-y-4">
        <div className={authAlertSuccessClass}>Hasło zostało zmienione.</div>
        {!result.globalSignOutConfirmed && <p className={authAlertErrorClass}>
          Nie udało się potwierdzić odwołania pozostałych sesji. Skontaktuj się z pomocą.
        </p>}
        {!result.localSessionCleared && <p className={authAlertErrorClass}>
          Nie udało się wylogować tej przeglądarki. Wyloguj się w ustawieniach konta.
        </p>}
        <Link className={authLinkClass} href={result.localSessionCleared ? '/login' : '/settings/security'}>
          {result.localSessionCleared ? 'Zaloguj się nowym hasłem' : 'Ustawienia bezpieczeństwa'}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {result && <div role="alert" className={authAlertErrorClass}>{ERRORS[result.error]}</div>}
      {result && result.error === 'mfa_required' && (
        <Link href="/login/two-factor?redirect=%2Freset-password" className={authLinkClass}>Potwierdź 2FA</Link>
      )}
      <div>
        <label htmlFor="new_password" className={authLabelClass}>Nowe hasło</label>
        <Input id="new_password" name="new_password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className={authInputClass} disabled={pending} />
      </div>
      <div>
        <label htmlFor="confirm_password" className={authLabelClass}>Powtórz nowe hasło</label>
        <Input id="confirm_password" name="confirm_password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className={authInputClass} disabled={pending} />
      </div>
      <Button type="submit" size="lg" className={authPrimaryButtonClass} disabled={pending}>
        {pending ? 'Zapisuję…' : 'Zapisz nowe hasło'}
      </Button>
    </form>
  );
}
