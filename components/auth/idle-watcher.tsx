'use client';

import { useCallback, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useInactivityTimeout } from '@/hooks/use-inactivity-timeout';
import { forceSignOutInactive } from '@/lib/auth/inactivity-logout';

/**
 * Monitoruje aktywność użytkownika w panelu. Po 59 min bez aktywności
 * pokazuje modal z 60-sekundowym countdownem. Po 60 min idle — automatic
 * sign-out (Server Action czyści sesję).
 *
 * Stosowane tylko w (dashboard) layout — strony marketingowe i auth
 * nie wymagają sesyjnego timeout.
 *
 * Zasada UX: w fazie warning ruch myszki NIE resetuje timera — user
 * musi explicit kliknąć "Pozostań zalogowany". Inaczej kot na klawiaturze
 * zniweczyłby ochronę.
 */
export function IdleWatcher() {
  const [isPending, startTransition] = useTransition();

  const handleTimeout = useCallback(() => {
    startTransition(() => {
      void forceSignOutInactive();
    });
  }, []);

  const { isWarning, secondsLeft, reset } = useInactivityTimeout({
    onTimeout: handleTimeout,
  });

  return (
    <Dialog open={isWarning}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Sesja wygasa</DialogTitle>
          <DialogDescription>
            Nie wykryliśmy aktywności od godziny. Za{' '}
            <span className="font-mono font-semibold text-foreground">
              {secondsLeft}s
            </span>{' '}
            zostaniesz automatycznie wylogowany.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={handleTimeout}
            disabled={isPending}
          >
            Wyloguj teraz
          </Button>
          <Button onClick={reset} disabled={isPending}>
            Pozostań zalogowany
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
