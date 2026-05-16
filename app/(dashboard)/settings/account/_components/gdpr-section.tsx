'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  requestGdprDeletionAction,
  type GdprDeletionResult,
} from '../actions';

const DELETION_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Sesja wygasła. Zaloguj się ponownie.',
  invalid_password: 'Hasło nieprawidłowe.',
  no_email: 'Twoje konto nie ma przypisanego emaila.',
  request_failed: 'Coś poszło nie tak. Spróbuj ponownie.',
};

export function GdprSection() {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<GdprDeletionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    setResult(null);
    startTransition(async () => {
      const r = await requestGdprDeletionAction(formData);
      setResult(r);
      if (r.ok) setConfirming(false);
    });
  };

  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5 space-y-2">
        <h3 className="font-medium">Żądanie zarejestrowane</h3>
        <p className="text-sm">
          Twoje konto zostanie trwale usunięte <strong>{result.scheduledFor}</strong>.
          Sprawdź skrzynkę pocztową — wysłaliśmy email z linkiem do anulowania.
          Możesz cofnąć decyzję w każdej chwili przed tą datą.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Pobierz moje dane</h3>
        <p className="text-sm text-muted-foreground">
          Eksport JSON ze wszystkimi danymi powiązanymi z Twoim kontem —
          profil, członkostwo w organizacjach, audit log, lista faktur. RODO
          art. 15.
        </p>
        <a
          href="/api/gdpr/export"
          className="inline-flex w-fit items-center justify-center rounded-xl border border-glass-border bg-foreground/5 px-4 py-2 text-sm font-medium hover:bg-foreground/10 transition-colors"
        >
          Pobierz dane (JSON)
        </a>
      </div>

      <div className="border-t border-glass-border/50 pt-4">
        <h3 className="font-medium">Trwałe usunięcie konta</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Twoje konto, sesje, kody ratunkowe 2FA i logi audytowe zostaną usunięte
          po <strong>14-dniowym okresie wycofania</strong>. Faktury podlegające
          10-letniej retencji prawnej zostaną zachowane w organizacjach
          (obowiązek firm). RODO art. 17.
        </p>

        {!confirming ? (
          <Button
            variant="destructive"
            className="mt-3"
            onClick={() => setConfirming(true)}
          >
            Usuń moje konto
          </Button>
        ) : (
          <form action={onSubmit} className="mt-3 space-y-3 max-w-sm">
            <p className="text-sm">
              Potwierdź aktualnym hasłem. Otrzymasz email z linkiem do
              cofnięcia decyzji (działa przez 14 dni).
            </p>
            <Input
              name="current_password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Aktualne hasło"
            />
            {result && !result.ok && (
              <p className="text-sm text-red-700 dark:text-red-400">
                {DELETION_ERROR_MESSAGES[result.error]}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={isPending}>
                {isPending ? 'Wysyłanie...' : 'Potwierdź — wyślij email'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirming(false);
                  setResult(null);
                }}
                disabled={isPending}
              >
                Anuluj
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
