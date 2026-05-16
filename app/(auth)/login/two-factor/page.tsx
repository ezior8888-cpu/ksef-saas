import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';
import { verifyMfaChallengeAction } from './actions';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code:
    'Kod nieprawidłowy. Sprawdź godzinę w telefonie albo użyj kodu ratunkowego.',
  no_factor:
    'Nie znaleźliśmy aktywnego 2FA. Skontaktuj się z pomocą techniczną.',
  rate_limited:
    'Zbyt wiele prób. Poczekaj chwilę i spróbuj ponownie.',
  unknown: 'Coś poszło nie tak. Spróbuj ponownie.',
};

export default async function TwoFactorChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') {
    redirect('/dashboard');
  }
  if (aal?.nextLevel !== 'aal2') {
    // User nie ma verified TOTP factora — nic do challenge'owania.
    redirect('/dashboard');
  }

  const { error, redirect: redirectParam } = await searchParams;
  const errorMsg = error ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.unknown : null;
  const safeNext = safeRedirectPath(redirectParam ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          Weryfikacja dwuetapowa
        </h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          Wpisz 6-cyfrowy kod z aplikacji TOTP albo jeden z kodów ratunkowych.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      <form action={verifyMfaChallengeAction} className="space-y-4">
        <input type="hidden" name="redirect" value={safeNext} />
        <div>
          <label
            htmlFor="code"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block"
          >
            Kod
          </label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456 lub kod ratunkowy"
            autoFocus
          />
        </div>
        <Button type="submit" variant="glass-primary" size="lg" className="w-full">
          Zweryfikuj
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Stracił/aś dostęp do telefonu i kodów ratunkowych?{' '}
        <a href="mailto:support@faktflow.pl" className="underline">
          Skontaktuj się z pomocą
        </a>
      </p>
    </div>
  );
}
