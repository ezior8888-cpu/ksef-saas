'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  enrollTotpAction,
  regenerateRecoveryCodesAction,
  unenrollTotpAction,
  verifyTotpEnrollmentAction,
} from '../actions';

interface Props {
  isEnabled: boolean;
  remainingRecoveryCodes: number;
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'enrolling'; factorId: string; qrCode: string; secret: string }
  | { kind: 'show-codes'; codes: string[] }
  | { kind: 'unenroll' }
  | { kind: 'regenerate' };

export function TwoFactorCard({ isEnabled, remainingRecoveryCodes }: Props) {
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
        setError(
          r.error === 'already_enrolled'
            ? 'Masz już aktywne 2FA. Wyłącz je przed dodaniem nowego.'
            : 'Nie udało się rozpocząć rejestracji. Spróbuj ponownie.',
        );
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
        setError('Nieprawidłowy kod. Sprawdź godzinę w telefonie i spróbuj ponownie.');
        return;
      }
      setStage({ kind: 'show-codes', codes: r.recoveryCodes });
    });
  };

  const onUnenrollSubmit = (formData: FormData) => {
    const password = String(formData.get('password') ?? '');
    setError(null);
    startTransition(async () => {
      const r = await unenrollTotpAction(password);
      if (!r.ok) {
        setError(
          r.error === 'invalid_password'
            ? 'Hasło nieprawidłowe.'
            : 'Nie udało się wyłączyć 2FA.',
        );
        return;
      }
      reset();
    });
  };

  const onRegenerateSubmit = (formData: FormData) => {
    const password = String(formData.get('password') ?? '');
    setError(null);
    startTransition(async () => {
      const r = await regenerateRecoveryCodesAction(password);
      if (!r.ok) {
        setError(
          r.error === 'invalid_password'
            ? 'Hasło nieprawidłowe.'
            : 'Nie udało się wygenerować nowych kodów.',
        );
        return;
      }
      setStage({ kind: 'show-codes', codes: r.recoveryCodes });
    });
  };

  if (stage.kind === 'show-codes') {
    return <RecoveryCodesPanel codes={stage.codes} onDone={reset} />;
  }

  if (stage.kind === 'enrolling') {
    return (
      <div className="space-y-4">
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
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Weryfikacja...' : 'Potwierdź'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={reset}
                  disabled={isPending}
                >
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
          Wyłączenie 2FA osłabi ochronę konta. Potwierdź aktualnym hasłem.
        </p>
        <Input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Aktualne hasło"
        />
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="destructive" disabled={isPending}>
            {isPending ? 'Wyłączanie...' : 'Wyłącz 2FA'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={reset}
            disabled={isPending}
          >
            Anuluj
          </Button>
        </div>
      </form>
    );
  }

  if (stage.kind === 'regenerate') {
    return (
      <form action={onRegenerateSubmit} className="space-y-3 max-w-sm">
        <p className="text-sm">
          Nowe kody zastąpią stare — nieaktualne kody przestaną działać.
          Potwierdź aktualnym hasłem.
        </p>
        <Input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Aktualne hasło"
        />
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Generowanie...' : 'Wygeneruj nowe kody'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={reset}
            disabled={isPending}
          >
            Anuluj
          </Button>
        </div>
      </form>
    );
  }

  // idle
  if (!isEnabled) {
    return (
      <div className="space-y-3">
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-foreground/5 border border-glass-border text-xs font-medium">
            Wyłączone
          </span>
        </div>
        <Button onClick={onEnroll} disabled={isPending}>
          {isPending ? 'Ładowanie...' : 'Włącz 2FA'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-medium text-green-700 dark:text-green-400">
          Włączone
        </span>
        <span className="text-sm text-muted-foreground">
          {remainingRecoveryCodes > 0
            ? `Pozostało ${remainingRecoveryCodes} kodów ratunkowych`
            : 'Brak kodów ratunkowych — wygeneruj nowe'}
        </span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          onClick={() => setStage({ kind: 'regenerate' })}
        >
          Nowe kody ratunkowe
        </Button>
        <Button
          variant="destructive"
          onClick={() => setStage({ kind: 'unenroll' })}
        >
          Wyłącz 2FA
        </Button>
      </div>
    </div>
  );
}

function RecoveryCodesPanel({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // graceful — user może ręcznie zaznaczyć
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-900 dark:text-yellow-200">
        <strong>Zapisz te kody w bezpiecznym miejscu</strong> (menedżer haseł,
        wydruk, sejf). Każdy działa raz — używaj gdy stracisz dostęp do
        aplikacji TOTP. Po opuszczeniu strony już ich NIE pokażemy.
      </div>
      <div className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <code
            key={c}
            className="px-3 py-2 rounded-lg bg-foreground/5 border border-glass-border"
          >
            {c}
          </code>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={onCopy} variant="outline">
          {copied ? 'Skopiowane!' : 'Skopiuj do schowka'}
        </Button>
        <Button onClick={onDone}>Mam zapisane — kontynuuj</Button>
      </div>
    </div>
  );
}
