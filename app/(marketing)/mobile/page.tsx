import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, MonitorSmartphone } from 'lucide-react';

import { PageHero } from '@/components/site/page-hero';
import { ButtonLink } from '@/components/site/ui';

export const metadata: Metadata = {
  title: 'FaktWay na telefon: aplikacja mobilna wkrótce',
  description:
    'Aplikacja mobilna FaktWay jest w przygotowaniu. Do czasu premiery korzystaj z FaktWay na komputerze.',
  robots: { index: false },
};

/**
 * BUG-008: telefony nie wchodzą do panelu aplikacji — proxy przekierowuje
 * je tutaj. Landing pozostaje dostępny; ta strona tłumaczy dlaczego i
 * wskazuje sklepy (badge'e „wkrótce" do podmiany na prawdziwe linki
 * po publikacji w App Store / Google Play).
 *
 * Od września 2026 blokadę zdejmuje przełącznik `NEXT_PUBLIC_MOBILE_PANEL`
 * (`lib/mobile-access.ts`). Konto z listy testowej NIE trafia już tutaj —
 * jedzie prosto do panelu. Ta strona jest tym, co widzą wszyscy pozostali,
 * i dlatego mówi też o wersji testowej: inaczej tester, który wyląduje tu
 * przed zalogowaniem, uzna, że przełącznik nie zadziałał.
 */
export default function MobilePage() {
  return (
    <div className="pb-20 sm:pb-28">
      <PageHero
        title={<>Aplikacja mobilna jest w{' '}przygotowaniu</>}
        lead="Panel FaktWay projektujemy na telefon od nowa, dlatego na razie nie udostępniamy go w przeglądarce mobilnej. Zaloguj się z komputera, a po premierze pobierzesz aplikację prosto ze sklepu."
      >
        <p className="mx-auto max-w-md text-sm text-pretty text-muted-foreground">
          Bierzesz udział w testach wersji mobilnej?{' '}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Zaloguj się
          </Link>
          . Jeśli Twoje konto jest na liście, wejdziesz prosto do panelu.
        </p>

        {/* Badge'e sklepów — placeholdery do podmiany po publikacji. */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <StoreBadge store="App Store" />
          <StoreBadge store="Google Play" />
        </div>

        <div className="mt-12 flex flex-col items-center gap-4">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <MonitorSmartphone aria-hidden className="size-4" />
            Na komputerze wszystko działa już teraz.
          </p>
          <ButtonLink href="/" variant="outline">
            <ArrowLeft aria-hidden className="size-4" />
            Wróć na stronę główną
          </ButtonLink>
        </div>
      </PageHero>
    </div>
  );
}

function StoreBadge({ store }: { store: 'App Store' | 'Google Play' }) {
  return (
    <span
      className="inline-flex cursor-not-allowed flex-col items-start rounded-2xl bg-muted/50 px-5 py-3 text-left ring-1 ring-border select-none"
      aria-disabled
    >
      <span className="text-xs text-muted-foreground">Wkrótce w</span>
      <span className="text-sm font-semibold text-foreground">{store}</span>
    </span>
  );
}
