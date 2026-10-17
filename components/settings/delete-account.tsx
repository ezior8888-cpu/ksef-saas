'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { requestAccountDeletionAction } from '@/components/settings/account-actions';
import { SUPPORT_EMAIL } from '@/lib/site';

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
      <Button
        variant="glass"
        size="lg"
        onClick={() => setShowConfirm(true)}
        className="border-red-500/30 hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/40 dark:hover:text-red-400"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Usuń firmę
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 backdrop-blur-glass-sm p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
        <div className="text-sm text-foreground space-y-2">
          {/* Ten przycisk dotyczy FIRMY (organizacji), nie konta użytkownika —
              konto usuwa sekcja RODO w Ustawienia → Konto i firma
              (lib/gdpr/deletion.ts, 14 dni). Usunięcie firmy idzie przez
              pomoc techniczną: flag tenants.deleted_at / is_active nic nie
              sprawdza, więc aplikacja nie umie firmy wyłączyć ani usunąć
              (ścieżka operatora: docs/support/escalation-matrix.md).
              Do 15.10.2026 opis obiecywał „od razu wyłączona” i usunięcie
              danych w 30 + 30 dni. Zgodne z regulaminem § 14 i umową
              powierzenia § 9. */}
          <p className="font-medium">
            Usunięcie firmy i wszystkich jej danych zlecasz przez pomoc
            techniczną.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Napisz na {SUPPORT_EMAIL} z adresu właściciela i podaj NIP firmy.
            Do czasu wykonania zlecenia firma i abonament działają bez zmian —
            abonament anulujesz w Ustawienia → Subskrypcja i rozliczenia.{' '}
            <strong>Najpierw pobierz kopię danych</strong> (Księgowość →
            Eksport).
            Faktury wysłane do KSeF przechowuje też Ministerstwo Finansów.
            Swoje konto użytkownika usuniesz osobno w Ustawienia → Konto
            i firma.
          </p>
        </div>
      </div>

      <div>
        <Label
          htmlFor="confirm-nip"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block"
        >
          Wpisz NIP firmy aby potwierdzić ({normalizedNip || '—'})
        </Label>
        <Input
          id="confirm-nip"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value.replace(/\D/g, ''))}
          placeholder={normalizedNip}
          maxLength={10}
          className="font-mono"
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant="glass"
          size="lg"
          onClick={() => {
            setShowConfirm(false);
            setConfirmInput('');
          }}
          disabled={isDeleting}
        >
          Anuluj
        </Button>
        <Button
          variant="glass"
          size="lg"
          onClick={handleDelete}
          disabled={!isConfirmValid || isDeleting}
          className="border-red-500/30 hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/40 dark:hover:text-red-400"
        >
          {isDeleting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Przetwarzanie…
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Potwierdź
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
