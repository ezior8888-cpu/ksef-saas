'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
        {/* Samo `reset()` renderuje ten sam ładunek RSC, więc błąd Server
            Componentu wraca od razu. Najpierw pobranie strony od nowa, potem
            ponowny render segmentu — wzór jak w `reports/kpir/error.tsx`.
            Wyłączony w trakcie: seria kliknięć przy awarii nie mnoży renderów
            strony na serwerze. Test: `panel-blad-ponow.test.tsx`. */}
        <Button
          size="lg"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          <RiRefreshLine aria-hidden />
          Spróbuj ponownie
        </Button>
      </CardContent>
    </Card>
  );
}
