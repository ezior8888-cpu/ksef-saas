import { AnalizyHeader } from '@/components/analizy/analizy-header';
import { KosztyGrid } from '@/components/analizy/koszty-grid';
import { ANALYTICS_MONTH_PARAM, analyticsMonthOptions, resolveAnalyticsMonth } from '@/lib/analytics-finance/months';
import { getPageContext } from '@/lib/supabase/page-context';

/**
 * Analiza kosztów (plan Finora P10 ← Finora `money-management/monthly-analytics`).
 * Strona nie liczy niczego sama (§2.4 pkt 15): każda karta w `KosztyGrid`
 * pobiera dane osobno, więc awaria jednego odczytu zabiera jedną kartę.
 * Wybrany miesiąc w adresie: `?miesiac=RRRR-MM` (Finora: `?month=`).
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Analiza kosztów' };

export default async function AnalizaKosztowPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ supabase, tenantId }, params] = await Promise.all([getPageContext(), searchParams]);
  const now = new Date();
  const month = resolveAnalyticsMonth(params[ANALYTICS_MONTH_PARAM], now);

  return (
    <div className="space-y-6">
      <AnalizyHeader
        title="Analiza kosztów"
        description="Śledź wydatki, kategorie i stałe koszty miesiąc po miesiącu."
        options={analyticsMonthOptions(now)}
        month={month}
      />
      <KosztyGrid supabase={supabase} tenantId={tenantId} nowIso={now.toISOString()} month={month} />
    </div>
  );
}
