import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const labelClass = 'text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block';

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
        <h2 className="text-2xl font-semibold tracking-tight">Utwórz konto</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          Pierwsza faktura w 5 minut
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Google */}
      <form action={loginWithGoogle}>
        <Button type="submit" variant="glass" size="lg" className="w-full">
          <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Zarejestruj przez Google
        </Button>
      </form>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/55 dark:border-white/14" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-white/62 dark:bg-[rgba(15,10,30,0.62)] px-3 text-muted-foreground">lub</span>
        </div>
      </div>

      <form action={signupWithEmail} className="space-y-4">
        <div>
          <label htmlFor="name" className={labelClass}>Imię i nazwisko</label>
          <Input id="name" name="name" type="text" required autoComplete="name" />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Hasło</label>
          <Input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" />
          <p className="text-xs text-muted-foreground mt-1.5">
            Min. 12 znaków, mała + duża litera, cyfra, znak specjalny. Sprawdzamy w bazie wycieków.
          </p>
        </div>
        <TurnstileWidget action="register" />
        <Button type="submit" variant="glass-primary" size="lg" className="w-full">
          Utwórz konto
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Masz już konto?{' '}
        <Link href="/login" className="font-medium text-foreground hover:text-foreground/70 transition-colors">
          Zaloguj się
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        Rejestrując się akceptujesz{' '}
        <Link href="/terms" className="underline hover:text-foreground transition-colors">regulamin</Link>
        {' '}i{' '}
        <Link href="/privacy" className="underline hover:text-foreground transition-colors">politykę prywatności</Link>
      </p>
    </div>
  );
}
