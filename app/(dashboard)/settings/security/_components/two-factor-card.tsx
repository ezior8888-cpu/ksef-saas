'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  enrollTotpAction,
  unenrollTotpAction,
  verifyTotpEnrollmentAction,
} from '../actions';

interface Props {
  isEnabled: boolean;
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'enrolling'; factorId: string; qrCode: string; secret: string }
  | { kind: 'unenroll' };

const MFA_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Zaloguj się ponownie i spróbuj jeszcze raz.',
  mfa_required: 'Potwierdź logowanie kodem z aplikacji 2FA i spróbuj ponownie.',
  rate_limited: 'Zbyt wiele prób. Poczekaj chwilę i spróbuj ponownie.',
  verification_unavailable: 'Nie możemy teraz potwierdzić operacji. Spróbuj ponownie za chwilę.',
  unenroll_incomplete: 'Usunięto część aplikacji TOTP, ale nie udało się zakończyć. Sprawdź stan zabezpieczeń i spróbuj ponownie.',
  already_enrolled: 'Masz już aktywne 2FA. Potwierdź logowanie kodem z aplikacji.',
  verify_failed: 'Nieprawidłowy kod. Sprawdź godzinę w telefonie i spróbuj ponownie.',
};

function RecoveryUnavailableNotice() {
  return (
    <p className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-900 dark:text-yellow-200">
      Utrata dostępu do aplikacji TOTP może zablokować logowanie.
      Samodzielne odzyskiwanie dostępu, także kodami ratunkowymi, jest obecnie
      niedostępne. W razie utraty dostępu{' '}
      <a href="mailto:support@faktflow.pl" className="underline underline-offset-4">
        skontaktuj się z pomocą
      </a>.
    </p>
  );
}

export function TwoFactorCard({ isEnabled }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setStage({ kind: 'idle' });
    setError(null);
  };

  const onEnroll = () => {
    setError(null);
    startTransition(async () => {
      const r = await enrollTotpAction();
      if (!r.ok) {
        setError(MFA_ERROR_MESSAGES[r.error ?? ''] ?? 'Nie udało się rozpocząć rejestracji. Spróbuj ponownie.');
        return;
      }
      setStage({
        kind: 'enrolling',
        factorId: r.factorId!,
        qrCode: r.qrCode!,
        secret: r.secret!,
      });
    });
  };

  const onVerify = (formData: FormData) => {
    if (stage.kind !== 'enrolling') return;
    const code = String(formData.get('code') ?? '').trim();
    setError(null);
    startTransition(async () => {
      const r = await verifyTotpEnrollmentAction(stage.factorId, code);
      if (!r.ok) {
        setError(MFA_ERROR_MESSAGES[r.error] ?? 'Nie udało się potwierdzić 2FA. Spróbuj ponownie.');
        return;
      }
      reset();
    });
  };

  const onUnenrollSubmit = (formData: FormData) => {
    const password = String(formData.get('password') ?? '');
    setError(null);
    startTransition(async () => {
      const r = await unenrollTotpAction(password);
      if (!r.ok) {
        setError(
          MFA_ERROR_MESSAGES[r.error] ??
            (r.error === 'invalid_password' ? 'Hasło nieprawidłowe.' : 'Nie udało się wyłączyć 2FA.'),
        );
        return;
      }
      reset();
    });
  };

  if (stage.kind === 'enrolling') {
    return (
      <div className="space-y-4">
        <RecoveryUnavailableNotice />
        <p className="text-sm">
          Zeskanuj QR aplikacją TOTP (Google Authenticator, 1Password, Authy)
          i wpisz 6-cyfrowy kod, aby potwierdzić.
        </p>
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={stage.qrCode}
            alt="QR code TOTP"
            className="w-44 h-44 rounded-xl bg-white p-3"
          />
          <div className="flex-1 space-y-3 min-w-0">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Lub wpisz ręcznie
              </p>
              <code className="block mt-1 break-all font-mono text-xs bg-foreground/5 px-3 py-2 rounded-lg">
                {stage.secret}
              </code>
            </div>
            <form action={onVerify} className="space-y-3">
              <div>
                <label
                  htmlFor="code"
                  className="text-xs uppercase tracking-wider text-muted-foreground font-medium block mb-1.5"
                >
                  Kod z aplikacji
                </label>
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                  placeholder="123456"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Weryfikacja...' : 'Potwierdź'}
                </Button>
                <Button type="button" variant="outline" onClick={reset} disabled={isPending}>
                  Anuluj
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (stage.kind === 'unenroll') {
    return (
      <form action={onUnenrollSubmit} className="space-y-3 max-w-sm">
        <p className="text-sm">
          Usunięcie aplikacji TOTP osłabi ochronę konta. Inne metody logowania pozostaną. Potwierdź aktualnym hasłem.
        </p>
        <Input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          maxLength={1024}
          placeholder="Aktualne hasło"
        />
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="destructive" disabled={isPending}>
            {isPending ? 'Wyłączanie...' : 'Wyłącz aplikację TOTP'}
          </Button>
          <Button type="button" variant="outline" onClick={reset} disabled={isPending}>
            Anuluj
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <span className={isEnabled
        ? 'inline-flex items-center px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-medium text-green-700 dark:text-green-400'
        : 'inline-flex items-center px-2.5 py-1 rounded-full bg-foreground/5 border border-glass-border text-xs font-medium'}>
        {isEnabled ? 'Włączone' : 'Wyłączone'}
      </span>
      <RecoveryUnavailableNotice />
      {isEnabled ? (
        <Button variant="destructive" onClick={() => setStage({ kind: 'unenroll' })}>
          Wyłącz aplikację TOTP
        </Button>
      ) : (
        <Button onClick={onEnroll} disabled={isPending}>
          {isPending ? 'Ładowanie...' : 'Włącz 2FA'}
        </Button>
      )}
    </div>
  );
}
