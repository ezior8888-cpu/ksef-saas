import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { plural } from '@/lib/i18n/plural';
import { getPageContext } from '@/lib/supabase/page-context';

import { buildInboxRows, INBOX_COLUMNS, loadInboxExpenseLinks, type InboxInvoiceRow } from './_components/inbox-rows';
import { InboxStatsCards } from './_components/inbox-stat-cells';
import { InboxTable } from './_components/inbox-table';

export const dynamic = 'force-dynamic';

/**
 * Skrzynka KSeF (plan Finora P9 ← Finora `/transactions`, ten sam układ co
 * Wydatki: kafle + karta z tabelą). Lista to rejestr faktur kosztowych ze
 * wszystkich środowisk KSeF, jak dotąd (200 najnowszych po dacie przyjęcia
 * w KSeF); kafle liczą osobne zapytania (§2.4 pkt 12) w osobnych granicach
 * błędu. Odczyt klientem z sesji (RLS) dla aktywnej firmy.
 */
export default async function InboxPage() {
  const { supabase, tenantId } = await getPageContext();

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(INBOX_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('direction', 'incoming')
    .order('ksef_accepted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  const invoiceRows = (invoices ?? []) as InboxInvoiceRow[];
  const links =
    !error && invoiceRows.length > 0
      ? await loadInboxExpenseLinks(supabase, tenantId, invoiceRows.map((row) => row.id))
      : [];
  const rows = buildInboxRows(invoiceRows, links);

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold">Skrzynka KSeF</h1>
        <p className="text-muted-foreground text-sm">
          Faktury zakupowe pobrane z KSeF (aktualizowane co 15 minut)
          {rows.length > 0
            ? ` · ${rows.length} ${plural(rows.length, ['pozycja', 'pozycje', 'pozycji'])} (maks. 200), sortowanie wg daty przyjęcia w KSeF`
            : ''}
        </p>
      </div>

      <InboxStatsCards supabase={supabase} tenantId={tenantId} />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Nie udało się pobrać faktur: {error.message}</AlertTitle>
        </Alert>
      ) : (
        <>
          {links === null ? (
            <Alert>
              <AlertTitle>Nie udało się sprawdzić statusu faktur</AlertTitle>
              <AlertDescription>
                Kolumna „Status” i przejście do wydatku są chwilowo ukryte. Odśwież stronę za chwilę.
              </AlertDescription>
            </Alert>
          ) : null}
          <Card>
            <InboxTable rows={rows} />
          </Card>
        </>
      )}
    </div>
  );
}
