'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';

import { acceptInvitationAction } from '@/app/actions/organizations';
import { Button } from '@/components/ui/button';

export function InviteAcceptForm({
  token,
  orgName,
}: {
  token: string;
  orgName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const handleAccept = () => {
    setError(null);
    start(async () => {
      const r = await acceptInvitationAction(token);
      if (r.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl p-4 text-sm">
          {error}
        </div>
      ) : null}
      <Button
        onClick={handleAccept}
        disabled={isPending}
        variant="glass-primary"
        size="lg"
        className="w-full"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Akceptuję...
          </>
        ) : (
          <>
            Dołącz do {orgName}
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
