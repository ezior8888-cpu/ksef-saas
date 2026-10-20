'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { toggleContractorRemindersAction } from '@/app/actions/reminders';
import { Switch } from '@/components/contractors/finora/switch';

interface Props {
  contractorId: string;
  excluded: boolean;
}

/**
 * Przełącznik przypomnień kontrahenta (P13: „Przypomnienia (przełącznik)”).
 * Włączony = przypomnienia idą; wyłączony = kontrahent wykluczony
 * (`reminder_excluded`). Akcja i komunikaty bez zmian.
 */
export function ContractorReminderToggle({ contractorId, excluded }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localExcluded, setLocalExcluded] = useState(excluded);

  const handleToggle = () => {
    startTransition(async () => {
      const newValue = !localExcluded;

      const result = await toggleContractorRemindersAction(
        contractorId,
        newValue,
        undefined,
      );

      if (result.success) {
        setLocalExcluded(newValue);
        toast.success(
          newValue
            ? 'Przypomnienia wyłączone dla tego kontrahenta'
            : 'Przypomnienia włączone dla tego kontrahenta',
        );
        router.refresh();
      } else {
        toast.error(result.error ?? 'Błąd');
      }
    });
  };

  const label = localExcluded ? 'Przypomnienia wyłączone' : 'Przypomnienia włączone';

  return (
    <Switch
      checked={!localExcluded}
      onCheckedChange={handleToggle}
      disabled={isPending}
      aria-label={label}
      title={label}
    />
  );
}
