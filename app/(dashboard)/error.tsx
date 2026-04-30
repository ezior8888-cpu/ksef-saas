'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] py-20 text-center space-y-6 max-w-lg mx-auto">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
        <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          Coś poszło nie tak
        </h2>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Wystąpił nieoczekiwany błąd. Możesz spróbować ponownie.
        </p>
      </div>
      <Button onClick={reset} variant="glass-primary" size="lg">
        <RefreshCw className="h-4 w-4 mr-2" />
        Spróbuj ponownie
      </Button>
    </div>
  );
}
