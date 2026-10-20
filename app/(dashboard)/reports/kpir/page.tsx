import { KpirView } from '@/components/expenses/kpir-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getKpirData } from '@/lib/reports/kpir-data';
import { getPageContext } from '@/lib/supabase/page-context';

export const dynamic = 'force-dynamic';

/**
 * KPiR (P13, PLAN-FINORA §5): tabela w układzie Transactions Finory. Dane
 * czyta `getKpirData` (`lib/reports/kpir-data.ts`) — logika bez zmian.
 * Waluty nie do potwierdzenia wstrzymują raport (baner zamiast kwot), a błąd
 * odczytu zaliczek ROZ idzie na baner nad tabelą.
 */
export default async function KpirPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getPageContext();
  const data = await getKpirData(supabase, tenantId, sp);
  const banner = data.currencyBlocked ?? data.settledError;

  return (
    <div className="space-y-6 pb-10">
      {banner ? (
        <Alert variant="destructive">
          <AlertTitle>{banner}</AlertTitle>
          <AlertDescription>
            {data.currencyBlocked
              ? 'Kwot KPiR za ten miesiąc nie pokazujemy, dopóki dokumenty nie mają potwierdzonej waluty PLN.'
              : 'Przychód z faktur rozliczeniowych może być zawyżony — odśwież stronę za chwilę.'}
          </AlertDescription>
        </Alert>
      ) : null}
      {!data.currencyBlocked ? (
        <KpirView
          month={data.month}
          year={data.year}
          expenses={data.expenses}
          invoices={data.invoices}
        />
      ) : null}
    </div>
  );
}
