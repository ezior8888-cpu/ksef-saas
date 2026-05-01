'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { requestAccountDeletionAction } from '@/components/settings/account-actions';

export function DeleteAccountSection({ tenantNip }: { tenantNip: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, startDeleting] = useTransition();

  const normalizedNip = tenantNip.replace(/\D/g, '');
  const isConfirmValid = confirmInput === normalizedNip;

  const handleDelete = () => {
    if (!isConfirmValid) return;

    startDeleting(async () => {
      const formData = new FormData();
      formData.set('nipConfirm', confirmInput);
      const result = await requestAccountDeletionAction(formData);
      if ('success' in result && result.success === false) {
        toast.error(result.error);
      }
      // Sukces → redirect obsługuje akcja serwerowa (`/login?success=account_deleted`).
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
        Usuń konto
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 backdrop-blur-glass-sm p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
        <div className="text-sm text-foreground space-y-2">
          <p className="font-medium">
            Ta operacja jest nieodwracalna po 30 dniach.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Wszystkie faktury, kontrahenci, certyfikaty i dane konta zostaną
            trwale usunięte. Faktury zachowane zgodnie z polityką retencji
            10 lat (RODO).
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
              Usuwam...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Potwierdź usunięcie konta
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
