import Link from 'next/link';
import { RiArrowRightLine, RiSparkling2Line } from '@remixicon/react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { getPageContext } from '@/lib/supabase/page-context';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Klasy karty rachunku z Accounts Finory (`account-card`: przycisk `outline` jako karta). */
const ACCOUNT_CARD = cn(
  buttonVariants({ variant: 'outline' }),
  'h-auto w-full flex-col items-stretch gap-4 p-4 text-left whitespace-normal',
);

function ImportHeading() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Import danych</h1>
      <p className="text-muted-foreground text-sm">
        Magiczny import historii z KSeF — ten sam krok co w ustawieniach KSeF.
      </p>
    </div>
  );
}

function MagicImportCardBody({ ready }: { ready: boolean }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Avatar className="size-9 items-center justify-center">
          <AvatarFallback className="bg-transparent">
            <RiSparkling2Line className="text-foreground size-5" />
          </AvatarFallback>
        </Avatar>
        <Badge
          variant="secondary"
          className={cn(
            'font-normal',
            ready
              ? 'bg-green-600/10 text-green-700 dark:bg-green-400/10 dark:text-green-400'
              : 'bg-amber-600/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400',
          )}
        >
          {ready ? 'Gotowy' : 'Wymaga certyfikatu KSeF'}
        </Badge>
      </div>
      <div>
        <p className="text-foreground font-medium wrap-break-word">Magiczny Import historii</p>
        <p className="text-muted-foreground text-sm wrap-break-word">
          Pobierz faktury z KSeF w wybranym zakresie i uzupełnij kartotekę
          kontrahentów oraz produktów bez ręcznego przepisywania.
        </p>
      </div>
    </>
  );
}

/** Import danych (P13): karta w stylu Accounts Finory; logika bez zmian. */
export default async function ImportDanychPage() {
  const { supabase, tenantId } = await getPageContext();

  if (!tenantId) {
    return (
      <div className="space-y-6 pb-6">
        <ImportHeading />
        <Alert>
          <AlertDescription>
            Import uruchomisz po założeniu organizacji i konfiguracji certyfikatu KSeF.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, nip, has_ksef_credentials')
    .eq('id', tenantId)
    .single();

  const hasCredentials = !!tenant?.has_ksef_credentials;

  return (
    <div className="space-y-6 pb-6">
      <ImportHeading />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {hasCredentials ? (
          <Link
            href={`/onboarding/magic-import?tenantId=${encodeURIComponent(tenantId)}`}
            className={ACCOUNT_CARD}
          >
            <MagicImportCardBody ready />
            <span className="text-primary inline-flex items-center gap-1.5 text-sm font-medium">
              Rozpocznij Magiczny Import
              <RiArrowRightLine className="size-4" aria-hidden />
            </span>
          </Link>
        ) : (
          <div className={cn(ACCOUNT_CARD, 'hover:bg-background cursor-default dark:hover:bg-input/30')}>
            <MagicImportCardBody ready={false} />
            <p className="text-muted-foreground text-sm">
              Aby uruchomić import, najpierw wgraj certyfikat KSeF w{' '}
              <Link href="/settings/ksef" className="text-primary font-medium underline underline-offset-2">
                ustawieniach KSeF
              </Link>
              .
            </p>
          </div>
        )}
      </div>

      {tenant?.nip ? (
        <p className="text-muted-foreground text-sm">
          Aktywna organizacja: <span className="text-foreground font-medium">{tenant.name}</span>{' '}
          · NIP <span className="font-mono">{tenant.nip}</span>
        </p>
      ) : null}
    </div>
  );
}
