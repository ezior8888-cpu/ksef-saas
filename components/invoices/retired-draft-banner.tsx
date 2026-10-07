import Link from 'next/link';
import { Ban, FilePlus2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DUPLICATE_DECISION_TEXTS, type RetiredDraftView } from '@/lib/ksef/duplicate-decision';

/**
 * Baner szkicu wycofanego (D-A4-1b-3 PR B, decyzje Bartosza 07.10.2026: 2, 3, 9):
 * szkic z wpisem `number_taken` — po decyzji klienta przy 440 albo po
 * automatycznym „numer zajęty” — każdego rodzaju. Tytuł, treść i JEDYNY
 * przycisk banera: „Wystaw nową fakturę” (zwykła: „inna sprzedaż” i automat)
 * albo „Wystaw nową fakturę zaliczkową”. Korekta i faktura rozliczeniowa nie
 * mają przycisku — ich wyjście to „Usuń szkic” w pasku akcji. Przy decyzji
 * „ta sama sprzedaż” z powodem known-number — odnośnik do dokumentu Y.
 *
 * Widok liczy serwer (`retiredDraftView`); komponent tylko go pokazuje.
 */
export function RetiredDraftBanner({ view }: { view: RetiredDraftView }) {
  const known = view.knownInvoice;
  return (
    <Card className="p-4 mb-6 border-amber-200 bg-amber-50">
      <div className="flex items-start gap-3">
        <Ban className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-2">
          <h3 className="font-semibold text-sm text-amber-900">{view.title}</h3>
          <p className="text-sm text-amber-900">{view.body}</p>
          {known && (
            <p className="text-sm">
              <Link
                href={`/invoices/${encodeURIComponent(known.id)}`}
                className="font-medium text-amber-900 underline underline-offset-2 hover:no-underline"
              >
                {DUPLICATE_DECISION_TEXTS.KNOWN_LINK(known.internalNumber ?? 'bez numeru')}
              </Link>
            </p>
          )}
          {view.cta && (
            <div className="pt-1">
              <Button asChild>
                <Link href={view.cta.href}>
                  <FilePlus2 className="h-4 w-4 mr-2" aria-hidden />
                  {view.cta.label}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
