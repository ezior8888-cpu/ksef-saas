'use client';

import { useTransition } from 'react';

import { Loader2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { bulkValidateContractorsAction } from '@/app/actions/validation';
import { Button } from '@/components/ui/button';

export function BulkValidateButton() {
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
      variant="glass"
      size="lg"
      disabled={isStarting}
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
