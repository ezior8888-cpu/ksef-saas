'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import type { PerTenantFlag } from '@/lib/feature-flags';

import { toggleTenantFlagAction } from '../actions';

interface Props {
  tenantId: string;
  flag: PerTenantFlag;
  initialEnabled: boolean;
  label: string;
}

export function FlagToggle({ tenantId, flag, initialEnabled, label }: Props) {
  const router = useRouter();
  const [optimisticEnabled, setOptimisticEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    const next = !optimisticEnabled;
    setOptimisticEnabled(next);
    startTransition(async () => {
      const result = await toggleTenantFlagAction(tenantId, flag, next);
      if (!result.success) {
        toast.error(`${label}: ${result.error}`);
        setOptimisticEnabled(initialEnabled);
      } else {
        toast.success(result.message ?? `${label} zmienione`);
        router.refresh();
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={optimisticEnabled}
      aria-label={`${label}: ${optimisticEnabled ? 'włączone' : 'wyłączone'}`}
      className={cn(
        'group inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
        optimisticEnabled
          ? 'bg-emerald-500/80 dark:bg-emerald-500/60'
          : 'bg-foreground/15',
        isPending && 'opacity-60 cursor-wait',
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full bg-background shadow-sm transition-transform',
          optimisticEnabled ? 'translate-x-5' : 'translate-x-0.5',
        )}
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : optimisticEnabled ? (
          <Check className="h-3 w-3 text-emerald-600" />
        ) : (
          <X className="h-3 w-3 text-muted-foreground" />
        )}
      </span>
    </button>
  );
}
