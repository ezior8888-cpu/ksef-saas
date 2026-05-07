'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BellOff, Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { toggleContractorRemindersAction } from '@/app/actions/reminders';

interface Props {
  contractorId: string;
  excluded: boolean;
}

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

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      title={localExcluded ? 'Przypomnienia wyłączone' : 'Przypomnienia włączone'}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : localExcluded ? (
        <BellOff className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
      ) : (
        <Bell className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      )}
    </button>
  );
}
