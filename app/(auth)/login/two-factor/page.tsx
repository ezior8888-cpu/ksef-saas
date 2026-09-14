import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  authAlertErrorClass,
  authInputClass,
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
  authSubtitleClass,
  authTitleClass,
} from '@/components/auth/auth-form-styles';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedMfaState } from '@/lib/auth/verified-mfa';
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
  const { error, redirect: redirectParam } = await searchParams;
  const safeNext = safeRedirectPath(redirectParam ?? null);
  const state = await getVerifiedMfaState(await createClient());
  if (state.status === 'unauthenticated') redirect('/login');
  if (state.status === 'verified') redirect(safeNext);
  if (state.status === 'enrollment_required') redirect('/settings/security');

  const errorMsg = error ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.unknown : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className={authTitleClass}>Weryfikacja dwuetapowa</h2>
        <p className={authSubtitleClass}>
          Wpisz 6-cyfrowy kod z aplikacji TOTP albo jeden z kodów ratunkowych.
        </p>
      </div>

      {errorMsg && <div className={authAlertErrorClass}>{errorMsg}</div>}

      <form action={verifyMfaChallengeAction} className="space-y-4">
        <input type="hidden" name="redirect" value={safeNext} />
        <div>
          <label htmlFor="code" className={authLabelClass}>
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
            className={authInputClass}
          />
        </div>
        <Button type="submit" size="lg" className={authPrimaryButtonClass}>
          Zweryfikuj
        </Button>
      </form>

      <p className="text-center text-xs text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
        Stracił/aś dostęp do telefonu i kodów ratunkowych?{' '}
        <a href="mailto:support@faktflow.pl" className={authLinkClass}>
          Skontaktuj się z pomocą
        </a>
      </p>
    </div>
  );
}
