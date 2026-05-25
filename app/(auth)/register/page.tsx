import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthDivider } from '@/components/auth/auth-divider';
import {
  authAlertErrorClass,
  authGoogleButtonClass,
  authInputClass,
  authLabelClass,
  authLinkClass,
  authMutedTextClass,
  authPrimaryButtonClass,
  authSubtitleClass,
  authTitleClass,
} from '@/components/auth/auth-form-styles';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';
import { loginWithGoogle } from '../login/actions';
import { signupWithEmail } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Wypełnij wszystkie pola.',
  weak_password:
    'Hasło musi mieć min. 12 znaków, zawierać małą i dużą literę, cyfrę oraz znak specjalny.',
  password_breached:
    'To hasło pojawiło się w znanych wyciekach danych. Wybierz inne — najlepiej passphrase z 4-5 losowych słów.',
  rate_limited:
    'Zbyt wiele prób rejestracji z tego urządzenia. Poczekaj kilka minut i spróbuj ponownie.',
  bot_check_failed:
    'Nie udało się potwierdzić, że nie jesteś botem. Odśwież stronę i spróbuj ponownie.',
  'email rate limit exceeded':
    'Przekroczono limit wysyłki maili. Poczekaj kilka minut i spróbuj ponownie.',
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; retry?: string }>;
}) {
  const { error, retry } = await searchParams;
  const retryMinutes = retry ? Math.ceil(Number(retry) / 60) : null;
  const errorMsg = error
    ? error === 'rate_limited' && retryMinutes
      ? `Zbyt wiele prób rejestracji. Spróbuj ponownie za ~${retryMinutes} min.`
      : (ERROR_MESSAGES[error] ?? error)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className={authTitleClass}>Utwórz konto</h2>
        <p className={authSubtitleClass}>Pierwsza faktura w 5 minut</p>
      </div>

      {errorMsg && <div className={authAlertErrorClass}>{errorMsg}</div>}

      <form action={loginWithGoogle}>
        <Button
          type="submit"
          variant="outline"
          size="lg"
          className={authGoogleButtonClass}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Zarejestruj przez Google
        </Button>
      </form>

      <AuthDivider />

      <form action={signupWithEmail} className="space-y-4">
        <div>
          <label htmlFor="name" className={authLabelClass}>
            Imię i nazwisko
          </label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className={authInputClass}
          />
        </div>
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
            className={authInputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className={authLabelClass}>
            Hasło
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            className={authInputClass}
          />
          <p className="mt-1.5 text-xs text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Min. 12 znaków, mała + duża litera, cyfra, znak specjalny. Sprawdzamy w bazie wycieków.
          </p>
        </div>
        <TurnstileWidget action="register" theme="dark" />
        <Button type="submit" size="lg" className={authPrimaryButtonClass}>
          Utwórz konto
        </Button>
      </form>

      <p className={`text-center ${authMutedTextClass}`}>
        Masz już konto?{' '}
        <Link href="/login" className={authLinkClass}>
          Zaloguj się
        </Link>
      </p>
      <p className={`text-center text-xs ${authMutedTextClass}`}>
        Rejestrując się akceptujesz{' '}
        <Link href="/legal/regulamin" className={authLinkClass}>
          regulamin
        </Link>{' '}
        i{' '}
        <Link href="/legal/polityka-prywatnosci" className={authLinkClass}>
          politykę prywatności
        </Link>
      </p>
    </div>
  );
}
