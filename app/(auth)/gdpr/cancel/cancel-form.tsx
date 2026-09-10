'use client';

import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  authAlertErrorClass, authAlertSuccessClass, authPrimaryButtonClass, authSubtitleClass,
} from '@/components/auth/auth-form-styles';
import { cancelGdprDeletionAction, type GdprCancelState } from './actions';

export function GdprCancelForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<GdprCancelState, FormData>(cancelGdprDeletionAction, { outcome: 'idle' });
  useEffect(() => {
    if (state.outcome === 'canceled') window.history.replaceState(null, '', '/gdpr/cancel');
  }, [state.outcome]);

  if (state.outcome === 'canceled') {
    return <div className={authAlertSuccessClass}>Żądanie usunięcia konta zostało anulowane. Twoje konto pozostaje aktywne.</div>;
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className={authSubtitleClass}>
        Samo otwarcie linku nie zmienia Twojej decyzji. Użyj przycisku,
        aby anulować zaplanowane usunięcie konta.
      </p>
      {state.outcome === 'invalid' && <div className={authAlertErrorClass}>Link jest nieprawidłowy, został już użyty lub usuwanie konta już się rozpoczęło.</div>}
      {state.outcome === 'failed' && <div className={authAlertErrorClass}>Nie udało się potwierdzić anulowania. Spróbuj ponownie.</div>}
      <Button type="submit" size="lg" className={authPrimaryButtonClass} disabled={pending}>
        {pending ? 'Potwierdzanie...' : 'Zachowaj moje konto'}
      </Button>
    </form>
  );
}
