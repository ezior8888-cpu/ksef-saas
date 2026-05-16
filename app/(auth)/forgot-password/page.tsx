import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const labelClass =
  'text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block';

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
        <h2 className="text-2xl font-semibold tracking-tight">Reset hasła</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          Wyślemy Ci link do ustawienia nowego hasła
        </p>
      </div>

      {successMsg && (
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      <form action={requestPasswordReset} className="space-y-4">
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <Input id="email" name="email" type="email" required autoComplete="email"
                 placeholder="twoj@email.pl" />
        </div>
        <TurnstileWidget action="forgot-password" />
        <Button type="submit" variant="glass-primary" size="lg" className="w-full">
          Wyślij link resetujący
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground hover:text-foreground/70 transition-colors">
          ← Powrót do logowania
        </Link>
      </p>
    </div>
  );
}
