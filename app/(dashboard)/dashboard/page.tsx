import {
  FinanseSlot,
  KafelFakturSlot,
  KafelSredniejSlot,
  NaleznosciSlot,
  PrzychodSlot,
  RankingiSlot,
  VatSlot,
  type PulpitSlotProps,
} from '@/components/dashboard/finora/sloty';
import { kontekstDanych } from '@/lib/demo/tryb-danych';
import { getPageContext } from '@/lib/supabase/page-context';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — kompozycja ekranu.
 *
 * Pulpit = strona Finance szablonu Finora 1:1 (decyzja Bartosza 19.10.2026):
 * ta sama siatka, karty, wykresy i animacje, bez FLO. Od E5
 * PLAN-PRAWDZIWE-DANE karty pokazują prawdziwe dane firmy (sloty
 * `components/dashboard/finora/sloty.tsx`), a przed weryfikacją KSeF — dane
 * przykładowe czytane tymi samymi loaderami z atrapy bazy. Tryb liczy
 * wyłącznie `kontekstDanych`; strona nie woła sama żadnej funkcji danych.
 *
 * Pełna mapa: `docs/flo/UKLAD-DASHBOARDU.md`.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardHomePage() {
  const pageCtx = await getPageContext();
  const { supabase, tenantId, nowIso, tryb, verifiedAt } = await kontekstDanych(pageCtx, new Date());
  const props: PulpitSlotProps = { supabase, tenantId, nowIso, tryb, verifiedAt };

  return (
    <div className="grid grid-cols-6 gap-6">
      {/* Tytuł strony był w pasku górnym; pasek Finory go nie ma (21.10.2026). */}
      <h1 className="sr-only">Pulpit</h1>
      <FinanseSlot {...props} className="col-span-full xl:col-span-4" />

      <div className="col-span-full grid grid-cols-2 gap-6 lg:col-span-3 xl:col-span-2">
        <KafelFakturSlot {...props} />
        <KafelSredniejSlot {...props} />

        <PrzychodSlot {...props} />

        <VatSlot {...props} />
      </div>

      <NaleznosciSlot {...props} className="col-span-full lg:col-span-3 xl:col-span-2" />

      <RankingiSlot {...props} className="col-span-full xl:col-span-4" />
    </div>
  );
}
