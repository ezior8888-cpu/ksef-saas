import { createClient } from '@/lib/supabase/server';
import { TrendingUp, FileText, CheckCircle2, Coins } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardHomePage() {
  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthIso = startOfMonth.toISOString().slice(0, 10);

  const { data: monthInvoices } = await supabase
    .from('invoices')
    .select('gross_total, net_total, vat_total, ksef_status')
    .eq('direction', 'issued')
    .gte('issue_date', startOfMonthIso);

  const issuedCount = monthInvoices?.length ?? 0;
  const acceptedCount =
    monthInvoices?.filter((i) => i.ksef_status === 'accepted').length ?? 0;
  const totalNet =
    monthInvoices?.reduce((sum, i) => sum + Number(i.net_total ?? 0), 0) ?? 0;
  const totalVat =
    monthInvoices?.reduce((sum, i) => sum + Number(i.vat_total ?? 0), 0) ?? 0;
  const totalGross =
    monthInvoices?.reduce((sum, i) => sum + Number(i.gross_total ?? 0), 0) ?? 0;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const { data: yearInvoices } = await supabase
    .from('invoices')
    .select('gross_total, issue_date')
    .eq('direction', 'issued')
    .gte('issue_date', sixMonthsAgo.toISOString().slice(0, 10));

  const monthlyData = new Map<string, number>();
  yearInvoices?.forEach((inv) => {
    const key = inv.issue_date.slice(0, 7);
    monthlyData.set(
      key,
      (monthlyData.get(key) ?? 0) + Number(inv.gross_total ?? 0),
    );
  });

  const sortedMonths = Array.from(monthlyData.entries()).sort();
  const maxMonthValue = Math.max(...sortedMonths.map(([, v]) => v), 1);

  const monthName = startOfMonth.toLocaleDateString('pl-PL', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-display font-semibold tracking-tighter-display">
          Dashboard
        </h1>
        <p className="mt-2 text-muted-foreground">
          Zestawienia sprzedaży i podatku VAT • {monthName}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Wystawione faktury
            </p>
            <p className="text-3xl font-display font-semibold tracking-tighter-display mt-1">
              {issuedCount}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-2xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Zaakceptowane przez KSeF
            </p>
            <p className="text-3xl font-display font-semibold tracking-tighter-display mt-1">
              {acceptedCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              z {issuedCount} wystawionych
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-2xl bg-orange-500/10 flex items-center justify-center">
              <Coins className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Suma VAT
            </p>
            <p className="text-3xl font-display font-semibold tracking-tighter-display mt-1 tabular-nums">
              {totalVat.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">PLN</p>
          </div>
        </div>

        <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-2xl bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Sprzedaż brutto
            </p>
            <p className="text-3xl font-display font-semibold tracking-tighter-display mt-1 tabular-nums">
              {totalGross.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">PLN</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8 space-y-5">
        <div>
          <h2 className="text-lg font-display font-semibold tracking-tighter-text">
            Podsumowanie podatku VAT
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{monthName}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Netto
            </p>
            <p className="text-2xl font-display font-semibold tracking-tighter-text tabular-nums">
              {totalNet.toFixed(2)} PLN
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              VAT
            </p>
            <p className="text-2xl font-display font-semibold tracking-tighter-text tabular-nums">
              {totalVat.toFixed(2)} PLN
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Brutto
            </p>
            <p className="text-2xl font-display font-semibold tracking-tighter-text tabular-nums">
              {totalGross.toFixed(2)} PLN
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8 space-y-5">
        <div>
          <h2 className="text-lg font-display font-semibold tracking-tighter-text">
            Sprzedaż w ostatnich 6 miesiącach
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Sumaryczna kwota brutto wystawionych faktur
          </p>
        </div>

        {sortedMonths.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">
            Brak danych do wyświetlenia
          </p>
        ) : (
          <div className="space-y-3">
            {sortedMonths.map(([month, value]) => {
              const widthPercent = (value / maxMonthValue) * 100;
              const monthLabel = new Date(month + '-01').toLocaleDateString(
                'pl-PL',
                { month: 'long', year: 'numeric' },
              );
              return (
                <div key={month} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground capitalize">
                      {monthLabel}
                    </span>
                    <span className="font-medium tabular-nums">
                      {value.toFixed(2)} PLN
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-foreground/5 overflow-hidden">
                    <div
                      className="h-full bg-foreground rounded-full transition-all duration-500 ease-apple"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
