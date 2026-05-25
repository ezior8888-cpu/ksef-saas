import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  authAlertErrorClass,
  authAlertSuccessClass,
  authInputClass,
  authLabelClass,
  authLinkClass,
  authMutedTextClass,
  authPrimaryButtonClass,
  authSubtitleClass,
  authTitleClass,
} from '@/components/auth/auth-form-styles';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';
import { requestPasswordReset } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: 'Podaj prawidłowy adres email.',
  rate_limited:
    'Zbyt wiele prób resetu hasła. Poczekaj chwilę i spróbuj ponownie.',
  bot_check_failed:
    'Nie udało się potwierdzić, że nie jesteś botem. Odśwież stronę i spróbuj ponownie.',
};

const SUCCESS_MESSAGES: Record<string, string> = {
  email_sent:
    'Jeśli konto z tym adresem istnieje, wysłaliśmy link do resetu hasła. Sprawdź skrzynkę (również folder spam).',
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; retry?: string }>;
}) {
  const { error, success, retry } = await searchParams;
  const retryMinutes = retry ? Math.ceil(Number(retry) / 60) : null;
  const errorMsg = error
    ? error === 'rate_limited' && retryMinutes
      ? `Zbyt wiele prób resetu hasła. Spróbuj ponownie za ~${retryMinutes} min.`
      : (ERROR_MESSAGES[error] ?? 'Coś poszło nie tak. Spróbuj ponownie.')
    : null;
  const successMsg = success ? SUCCESS_MESSAGES[success] : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className={authTitleClass}>Reset hasła</h2>
        <p className={authSubtitleClass}>
          Wyślemy Ci link do ustawienia nowego hasła
        </p>
      </div>

      {successMsg && <div className={authAlertSuccessClass}>{successMsg}</div>}
      {errorMsg && <div className={authAlertErrorClass}>{errorMsg}</div>}

      <form action={requestPasswordReset} className="space-y-4">
        <div>
          <label htmlFor="email" className={authLabelClass}>
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="twoj@email.pl"
            className={authInputClass}
          />
        </div>
        <TurnstileWidget action="forgot-password" />
        <Button type="submit" size="lg" className={authPrimaryButtonClass}>
          Wyślij link resetujący
        </Button>
      </form>

      <p className={`text-center ${authMutedTextClass}`}>
        <Link href="/login" className={authLinkClass}>
          ← Powrót do logowania
        </Link>
      </p>
    </div>
  );
}
