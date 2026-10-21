import { AnalizyHeader } from '@/components/analizy/analizy-header';
import { SprzedazGrid } from '@/components/analizy/sprzedaz-grid';
import { ANALYTICS_MONTH_PARAM, analyticsMonthOptions, resolveAnalyticsMonth } from '@/lib/analytics-finance/months';
import { getPageContext } from '@/lib/supabase/page-context';

/**
 * Analiza sprzedaży (plan Finora P11 ← Finora `money-management/monthly-analytics`
 * drugi raz + Asset Allocation z Net Worth + Top Gainers / Top Losers).
 * Strona nie liczy niczego sama (§2.4 pkt 15): każda karta w `SprzedazGrid`
 * pobiera dane osobno. Wybrany miesiąc w adresie: `?miesiac=RRRR-MM`.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Analiza sprzedaży' };

export default async function AnalizaSprzedazyPage({
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
        title="Analiza sprzedaży"
        description="Śledź sprzedaż, klientów i produkty miesiąc po miesiącu."
        options={analyticsMonthOptions(now)}
        month={month}
      />
      <SprzedazGrid supabase={supabase} tenantId={tenantId} nowIso={now.toISOString()} month={month} />
    </div>
  );
}
