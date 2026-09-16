'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  cancelOwnGdprDeletionAction, requestGdprDeletionAction,
  type GdprCancellationResult, type GdprDeletionResult,
} from '../actions';

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Sesja wygasła. Zaloguj się ponownie.',
  mfa_required: 'Potwierdź logowanie kodem weryfikacji dwuetapowej i spróbuj ponownie.',
  session_verification_failed: 'Nie udało się zweryfikować sesji. Zaloguj się ponownie.',
  invalid_password: 'Hasło nieprawidłowe.',
  no_email: 'Twoje konto nie ma przypisanego emaila.',
  request_failed: 'Nie udało się potwierdzić operacji. Odśwież stronę i sprawdź stan żądania.',
  not_pending: 'Żądanie zostało zakończone albo usuwanie konta już się rozpoczęło. Odśwież stronę.',
};
type ScheduledRequest = { scheduledFor: string; status: 'pending' | 'processing' };

export function GdprSection({ initialRequest = null }: { initialRequest?: ScheduledRequest | null }) {
  const [scheduled, setScheduled] = useState(initialRequest);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<GdprDeletionResult | null>(null);
  const [cancellation, setCancellation] = useState<GdprCancellationResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const requestDeletion = (formData: FormData) => {
    setResult(null);
    setCancellation(null);
    startTransition(async () => {
      const response = await requestGdprDeletionAction(formData);
      setResult(response);
      if (response.ok) {
        setScheduled({ scheduledFor: response.scheduledFor, status: 'pending' });
        setConfirming(false);
      }
    });
  };
  const cancelDeletion = (formData: FormData) => {
    setCancellation(null);
    startTransition(async () => {
      const response = await cancelOwnGdprDeletionAction(formData);
      setCancellation(response);
      if (response.ok) {
        setScheduled(null);
        setResult(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Pobierz moje dane</h3>
        <p className="text-sm text-muted-foreground">Eksport JSON profilu konta, członkostw i ostatnich wpisów audytu. Plik wskazuje ograniczenia wyników. Faktury pobierzesz przez eksport w panelu firmy.</p>
        <a href="/api/gdpr/export" className="inline-flex w-fit rounded-xl border border-glass-border bg-foreground/5 px-4 py-2 text-sm font-medium hover:bg-foreground/10">Pobierz dane (JSON)</a>
      </div>
      {cancellation?.ok && <p role="status" className="text-sm text-green-700 dark:text-green-400">Usunięcie konta zostało anulowane. Konto pozostaje aktywne.</p>}
      <div className="border-t border-glass-border/50 pt-4 space-y-3">
        {scheduled ? (
          <>
            <h3 className="font-medium">{scheduled.status === 'processing' ? 'Usuwanie konta rozpoczęte' : 'Usunięcie konta zaplanowane'}</h3>
            {scheduled.status === 'processing' ? (
              <p className="text-sm">Usuwanie konta już się rozpoczęło. Nie można go teraz anulować. W razie wątpliwości skontaktuj się z pomocą.</p>
            ) : (
              <>
                <p className="text-sm">Planowana data usunięcia: <strong>{scheduled.scheduledFor}</strong>.</p>
                {result?.ok && (
                  <p className="text-sm">
                    {result.alreadyScheduled
                      ? 'Żądanie było już zaplanowane. Poprzedni link z maila pozostaje ważny; termin nie został zmieniony.'
                      : result.emailSent
                        ? 'Wysłaliśmy email z linkiem do anulowania. Możesz też anulować żądanie poniżej.'
                        : 'Żądanie zapisano, ale nie udało się wysłać emaila. Możesz anulować je tutaj, potwierdzając hasłem.'}
                  </p>
                )}
                <form action={cancelDeletion} className="space-y-3 max-w-sm">
                  <p className="text-sm text-muted-foreground">Aby zachować konto, potwierdź aktualne hasło.</p>
                  <Input name="current_password" type="password" required autoComplete="current-password" placeholder="Aktualne hasło" />
                  {cancellation && !cancellation.ok && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{ERROR_MESSAGES[cancellation.error]}</p>}
                  <Button type="submit" variant="outline" disabled={isPending}>{isPending ? 'Potwierdzanie...' : 'Anuluj usunięcie konta'}</Button>
                </form>
              </>
            )}
          </>
        ) : (
          <>
            <h3 className="font-medium">Trwałe usunięcie konta</h3>
            <p className="text-sm text-muted-foreground">Usunięcie konta zostanie zaplanowane z 14-dniowym okresem na wycofanie decyzji. Faktury objęte retencją pozostaną w organizacjach.</p>
            {!confirming ? (
              <Button variant="destructive" onClick={() => setConfirming(true)}>Usuń moje konto</Button>
            ) : (
              <form action={requestDeletion} className="space-y-3 max-w-sm">
                <Input name="current_password" type="password" required autoComplete="current-password" placeholder="Aktualne hasło" />
                {result && !result.ok && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{ERROR_MESSAGES[result.error]}</p>}
                <div className="flex gap-2">
                  <Button type="submit" variant="destructive" disabled={isPending}>{isPending ? 'Zapisywanie...' : 'Potwierdź żądanie'}</Button>
                  <Button type="button" variant="outline" disabled={isPending} onClick={() => setConfirming(false)}>Wróć</Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
