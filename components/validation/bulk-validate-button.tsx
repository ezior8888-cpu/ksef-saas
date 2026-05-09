'use client';

import { useTransition } from 'react';

import { Loader2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { bulkValidateContractorsAction } from '@/app/actions/validation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function BulkValidateButton({
  className,
}: {
  className?: string;
} = {}) {
  const router = useRouter();
  const [isStarting, startBulk] = useTransition();

  const handleBulkValidate = () => {
    startBulk(async () => {
      const result = await bulkValidateContractorsAction({ forceRefresh: false });
      if (result.success) {
        toast.success(`Sprawdzam ${result.total} kontrahentów w tle...`);
        setTimeout(() => {
          router.refresh();
        }, 30000);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Button
      type="button"
      onClick={handleBulkValidate}
      variant="outline"
      size="lg"
      disabled={isStarting}
      className={cn(
        'ff-glass-pane ff-glass-pane-hover border-[color-mix(in_srgb,var(--ff-on-surface-variant)_18%,transparent)] font-bold text-[var(--ff-on-surface)] shadow-none hover:border-[color-mix(in_srgb,var(--ff-primary)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--ff-primary)_8%,transparent)] hover:text-[var(--ff-primary)]',
        className,
      )}
    >
      {isStarting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <ShieldCheck className="mr-2 h-4 w-4" />
      )}
      Sprawdź wszystkich
    </Button>
  );
}
