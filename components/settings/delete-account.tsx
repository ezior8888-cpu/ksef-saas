'use client';

import { useState, useTransition } from 'react';
import { RiDeleteBinLine, RiErrorWarningLine, RiLoader4Line } from '@remixicon/react';
import { toast } from 'sonner';

import { requestAccountDeletionAction } from '@/components/settings/account-actions';
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SUPPORT_EMAIL } from '@/lib/site';

/**
 * UWAGA (plan Finora P14, E10a): od E10a komponent NIE stoi na żadnym
 * ekranie — usunięcie firmy jest wyłącznie w „Konto i dane (RODO)”
 * (`DeleteAccountForm` na `/settings/account`). Plik zostaje, bo czyta go
 * `tests/unit/rodo-terminy-usuwania.test.ts`; wygląd przeniesiony na
 * prymitywy Finory, żeby w `components/settings` nie zostało szkło.
 *
 * Ten przycisk dotyczy FIRMY (organizacji), nie konta użytkownika — konto
 * usuwa sekcja RODO (lib/gdpr/deletion.ts, 14 dni). Usunięcie firmy idzie
 * przez pomoc techniczną: flag tenants.deleted_at / is_active nic nie
 * sprawdza, więc aplikacja nie umie firmy wyłączyć ani usunąć (ścieżka
 * operatora: docs/support/escalation-matrix.md). Zgodne z regulaminem § 14
 * i umową powierzenia § 9.
 */
export function DeleteAccountSection({ tenantNip }: { tenantNip: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, startDeleting] = useTransition();

  const normalizedNip = tenantNip.replace(/\D/g, '');
  const isConfirmValid = confirmInput === normalizedNip;

  const handleDelete = () => {
    if (!isConfirmValid) return;

    startDeleting(async () => {
      // Od 15.10.2026 akcja zawsze odmawia i kieruje do pomocy technicznej
      // (usuwanie firmy wstrzymane, NIP niczego nie odblokowuje) — komunikat
      // ma trzy zdania, stąd 20 s.
      const result = await requestAccountDeletionAction();
      toast.error(result.error, { duration: 20_000 });
    });
  };

  if (!showConfirm) {
    return (
      <Button variant="destructive" onClick={() => setShowConfirm(true)}>
        <RiDeleteBinLine aria-hidden />
        Usuń firmę
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <RiErrorWarningLine aria-hidden />
        <AlertTitle>Usunięcie firmy i wszystkich jej danych zlecasz przez pomoc techniczną.</AlertTitle>
        <AlertDescription>
          Napisz na {SUPPORT_EMAIL} z adresu właściciela i podaj NIP firmy. Do
          czasu wykonania zlecenia firma i abonament działają bez zmian —
          abonament anulujesz w Ustawienia → Abonament.{' '}
          <strong>Najpierw pobierz kopię danych</strong> (Księgowość → Eksport).
          Faktury wysłane do KSeF przechowuje też Ministerstwo Finansów. Swoje
          konto użytkownika usuniesz osobno w Ustawienia → Konto i dane (RODO).
        </AlertDescription>
      </Alert>

      <Field>
        <FieldContent>
          <FieldLabel htmlFor="confirm-nip">
            Wpisz NIP firmy aby potwierdzić ({normalizedNip || '—'})
          </FieldLabel>
        </FieldContent>
        <Input
          id="confirm-nip"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value.replace(/\D/g, ''))}
          placeholder={normalizedNip}
          maxLength={10}
          className="font-mono"
        />
      </Field>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setShowConfirm(false);
            setConfirmInput('');
          }}
          disabled={isDeleting}
        >
          Anuluj
        </Button>
        <Button variant="destructive" onClick={handleDelete} disabled={!isConfirmValid || isDeleting}>
          {isDeleting ? (
            <>
              <RiLoader4Line className="animate-spin" aria-hidden />
              Przetwarzanie…
            </>
          ) : (
            <>
              <RiDeleteBinLine aria-hidden />
              Potwierdź
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
