import {
  AktywnoscSlot,
  KosztySlot,
  OperacjeSlot,
  PierscienSlot,
  SpodziewaneSlot,
  WplywySlot,
  WykresSlot,
  ZrodlaSlot,
  type PrzeplywySlotProps
} from '@/components/przeplywy/finora-1do1/sloty'
import { kontekstDanych } from '@/lib/demo/tryb-danych'
import { getPageContext } from '@/lib/supabase/page-context'

/**
 * Przepływy = strona Cash Flow szablonu Finora 1:1 (decyzja Bartosza
 * 21.10.2026): ta sama siatka, karty, wykresy i animacje. Od E6
 * PLAN-PRAWDZIWE-DANE karty pokazują prawdziwe wpłaty i koszty firmy (sloty
 * `components/przeplywy/finora-1do1/sloty.tsx`), a przed weryfikacją KSeF —
 * dane przykładowe czytane tymi samymi loaderami z atrapy bazy. Tryb liczy
 * wyłącznie `kontekstDanych`; strona nie woła sama żadnej funkcji danych.
 *
 * Dawne karty (`components/przeplywy/przeplywy-grid.tsx`,
 * `components/przeplywy/finora/*`) zostają w kodzie jako wzór logiki.
 */
export const dynamic = 'force-dynamic'

const CashFlowDashboard = async () => {
  const pageCtx = await getPageContext()
  const { supabase, tenantId, nowIso, tryb, verifiedAt } = await kontekstDanych(pageCtx, new Date())
  const props: PrzeplywySlotProps = { supabase, tenantId, nowIso, tryb, verifiedAt }

  return (
    <>
      {/* Odstępstwo od Finory (WCAG 1.3.1): niewidoczny nagłówek strony dla czytników. */}
      <h1 className='sr-only'>Przepływy pieniężne</h1>
      <div className='grid grid-cols-6 gap-6'>
        <WykresSlot {...props} className='col-span-full xl:col-span-4' />

        <PierscienSlot {...props} className='col-span-full xl:col-span-2' />

        <WplywySlot {...props} className='col-span-full sm:col-span-3' />

        <KosztySlot {...props} className='col-span-full sm:col-span-3' />

        <ZrodlaSlot {...props} className='col-span-full lg:col-span-2' />

        <SpodziewaneSlot {...props} className='col-span-full lg:col-span-2' />

        <AktywnoscSlot {...props} className='col-span-full lg:col-span-2' />

        <OperacjeSlot {...props} className='col-span-full' />
      </div>
    </>
  )
}

export default CashFlowDashboard
