import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPageContext } from '@/lib/supabase/page-context';
import {
  INVOICE_PAGE_SIZE,
  INVOICE_STATUS_FILTERS,
  invoiceListHref,
  isFilteredList,
  pageRange,
  parseInvoiceListParams,
  searchOrFilter,
} from '@/lib/invoices/list-query';
import { InvoicesPullToRefresh } from './_components/invoices-pull-to-refresh';
import { BatchPdfDownload } from '@/components/invoices/batch-pdf-download';
import type { InvoiceRow } from '@/components/invoices/invoice-row-types';

export const dynamic = 'force-dynamic';

/**
 * Lista faktur wystawionych z wyszukiwaniem, filtrem statusu i okresu oraz
 * stronicowaniem w bazie (F-086). Parametry w adresie — działa bez JS
 * (formularz GET) i daje się zapisać w zakładkach.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, tenantId } = await getPageContext();
  const params = parseInvoiceListParams((await searchParams) ?? {});
  const [rangeFrom, rangeTo] = pageRange(params.page);

  let query = supabase
    .from('invoices')
    .select(
      'id, internal_number, issue_date, buyer_data, gross_total, ksef_status, ksef_number, created_at, xml_storage_path',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing');
  const statuses = INVOICE_STATUS_FILTERS[params.status].statuses;
  if (statuses) query = query.in('ksef_status', [...statuses]);
  if (params.from) query = query.gte('issue_date', params.from);
  if (params.to) query = query.lte('issue_date', params.to);
  const search = searchOrFilter(params.q);
  if (search) query = query.or(search);

  const { data: invoices, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(rangeFrom, rangeTo);

  const rows = (invoices ?? []) as InvoiceRow[];
  const total = count ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE));
  const filtered = isFilteredList(params);
  const listKey = rows
    .map(
      (row) =>
        `${row.id}:${row.ksef_status}:${String(row.internal_number ?? '')}:${String(row.ksef_number ?? '')}:${String(row.xml_storage_path ?? '')}`
    )
    .join('|');

  return (
    <div className="space-y-8 pb-10 text-[var(--ff-on-surface)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
            Faktury wystawione
          </h1>
          <p className="text-sm text-[var(--ff-text-muted)]">
            Faktury sprzedażowe — szkice, wysłane i przyjęte w KSeF
          </p>
        </div>
        {/* `flex-wrap` i pełna szerokość poniżej `sm`: na 375 px pasek
            rozpychał się do 452 px, więc przycisk „Nowa faktura" był przycięty
            przy prawej krawędzi. Strona nie przewijała się w bok, bo treść jest
            obcinana — czyli defekt nie dawał o sobie znać niczym poza tym, że
            przycisku po prostu nie dało się dokliknąć.
            Na telefonie „Nowa faktura" jest i tak w dolnej nawigacji, ale
            przycięty przycisk wygląda jak zepsuta strona. */}
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <BatchPdfDownload />
          <Button asChild variant="glass-primary" className="flex-1 sm:flex-none">
            <Link href="/invoices/new">
              <PlusCircle className="h-4 w-4 mr-2" />
              Nowa faktura
            </Link>
          </Button>
        </div>
      </div>

      <form
        method="get"
        action="/invoices"
        className="ff-glass-pane flex flex-wrap items-end gap-3 rounded-[var(--ff-radius-lg)] p-4"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[12px] font-semibold text-[var(--ff-text-muted)]">
          Szukaj
          <Input
            name="q"
            defaultValue={params.q}
            placeholder="Numer, nabywca, NIP albo kwota brutto"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--ff-text-muted)]">
          Status
          <select
            name="status"
            defaultValue={params.status}
            className="h-9 rounded-md border border-[var(--ff-border)] bg-transparent px-3 text-sm text-[var(--ff-on-surface)]"
          >
            {Object.entries(INVOICE_STATUS_FILTERS).map(([value, f]) => (
              <option key={value} value={value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--ff-text-muted)]">
          Wystawione od
          <Input type="date" name="od" defaultValue={params.from ?? ''} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--ff-text-muted)]">
          do
          <Input type="date" name="do" defaultValue={params.to ?? ''} />
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="glass-primary">
            Filtruj
          </Button>
          {filtered && (
            <Button asChild variant="outline">
              <Link href="/invoices">Wyczyść</Link>
            </Button>
          )}
        </div>
      </form>

      {error ? (
        <div className="rounded-[var(--ff-radius-lg)] border border-[var(--ff-danger)]/25 bg-[var(--ff-danger-tint)] px-5 py-4 text-sm text-[var(--ff-danger)]">
          Nie udało się pobrać faktur: {error.message}
        </div>
      ) : (
        <>
          <InvoicesPullToRefresh
            tenantId={tenantId}
            listKey={listKey}
            initialInvoices={rows}
            filtered={filtered}
            summary={
              total === 0
                ? undefined
                : `${rangeFrom + 1}–${rangeFrom + rows.length} z ${total} • sortowanie wg daty utworzenia`
            }
          />
          {pages > 1 && (
            <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Strony listy faktur">
              {params.page > 1 ? (
                <Link className="font-semibold text-[var(--ff-primary)]" href={invoiceListHref(params, { page: params.page - 1 })}>
                  ← Poprzednia
                </Link>
              ) : (
                <span />
              )}
              <span className="text-[var(--ff-text-muted)]">
                Strona {Math.min(params.page, pages)} z {pages}
              </span>
              {params.page < pages ? (
                <Link className="font-semibold text-[var(--ff-primary)]" href={invoiceListHref(params, { page: params.page + 1 })}>
                  Następna →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
