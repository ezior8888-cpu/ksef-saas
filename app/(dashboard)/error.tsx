'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { RiErrorWarningLine, RiRefreshLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    if (process.env.NODE_ENV === 'development') {
      console.error(error);
    }
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="space-y-6 py-12 text-center">
        <div className="bg-destructive/10 text-destructive inline-flex size-14 items-center justify-center">
          <RiErrorWarningLine className="size-7" aria-hidden />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">Coś poszło nie tak</h2>
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">
            Wystąpił nieoczekiwany błąd. Możesz spróbować ponownie.
          </p>
        </div>
        <Button onClick={reset} size="lg">
          <RiRefreshLine aria-hidden />
          Spróbuj ponownie
        </Button>
      </CardContent>
    </Card>
  );
}
