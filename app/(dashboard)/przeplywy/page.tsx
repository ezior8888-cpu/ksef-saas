import { Suspense } from 'react';

import { PendingReviewAlert, PrzeplywyGrid } from '@/components/przeplywy/przeplywy-grid';
import { getPageContext } from '@/lib/supabase/page-context';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — rama panelu.
 *
 * Przepływy = strona Cash Flow szablonu Finora z pierwszym rzędem strony
 * Net Worth (plan Finora P2, etap E5), na prawdziwych danych. Kwoty
 * sprzedaży i VAT pochodzą wyłącznie z faktur przyjętych w aktywnym
 * środowisku KSeF, wpływy — z oznaczonych wpłat, wydatki — z kosztów.
 *
 * Strona nie liczy niczego sama (§2.4 pkt 15): każda karta w siatce pobiera
 * swoje dane i pada osobno. Na telefonie dolna nawigacja prowadzi tu pod
 * nazwą „Miesiąc” — liczby miesiąca są w pierwszej karcie siatki.
 */
export const dynamic = 'force-dynamic';

export default async function PrzeplywyPage() {
  const { supabase, tenantId } = await getPageContext();
  const nowIso = new Date().toISOString();

  return (
    <div className="flex flex-col gap-6 py-6">
      <h1 className="sr-only">Przepływy pieniężne</h1>
      <Suspense fallback={null}>
        <PendingReviewAlert supabase={supabase} tenantId={tenantId} />
      </Suspense>
      <PrzeplywyGrid supabase={supabase} tenantId={tenantId} nowIso={nowIso} />
    </div>
  );
}
