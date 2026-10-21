import { AnalizyHeader } from '@/components/analizy/analizy-header';
import { SprzedazGrid } from '@/components/analizy/sprzedaz-grid';
import {
  ANALYTICS_MONTH_PARAM,
  analyticsMonthOptions,
  currentMonthKey,
  resolveAnalyticsMonth,
} from '@/lib/analytics-finance/months';
import { getPageContext } from '@/lib/supabase/page-context';

/**
 * Analiza sprzedaży (plan Finora P11 ← Finora `money-management/monthly-analytics`).
 * Poprawka Bartosza 21.10.2026 (Analizy 1:1 z Finory): ta sama siatka
 * 9 kart co Monthly Analytics, bez dodatkowego wiersza; z analizą kosztów
 * łączy ją przełącznik „Sprzedaż | Koszty” w nagłówku (jedna pozycja menu).
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
    // Ciemny motyw: w naszym `.dark` `--muted` == `--card`, więc Finorowe
    // `bg-muted` (wiersze, kółka ikon, tor paska, puste pola kalendarza,
    // szkielety) znikałyby na karcie. Na tej stronie `--muted` dostaje kolor
    // wnęki (`--background`, jak `--ff-surface-inset`); znaczniki Finory bez zmian.
    <div className="space-y-6 dark:[--muted:var(--background)]">
      <AnalizyHeader
        mode="sprzedaz"
        options={analyticsMonthOptions(now)}
        month={month}
        currentMonth={currentMonthKey(now)}
      />
      <SprzedazGrid supabase={supabase} tenantId={tenantId} nowIso={now.toISOString()} month={month} />
    </div>
  );
}
