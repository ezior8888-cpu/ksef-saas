'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ColumnDef, ColumnFiltersState, PaginationState } from '@tanstack/react-table';
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  RiArrowLeftDownLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowRightUpLine,
  RiBook2Line,
  RiDownload2Line,
  RiEyeLine,
  RiScales3Line,
} from '@remixicon/react';

import StatsCards from '@/components/dashboard/stats-cards';
import {
  ColumnSelectFilter,
  DataTablePagination,
  DataTableView,
  FinoraListCard,
  PageSizeSelect,
  TableSearch,
} from '@/components/lists/finora-data-table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { nonDeductedVat, kpirCostAmount } from '@/lib/categorization/kpir-cost';
import { earlierSaleRemark, kpirSaleEventDate } from '@/lib/categorization/kpir-revenue';
import { formatIsoDatePl } from '@/lib/format/iso-date';
import { companyInitials, shortenLegalForm } from '@/lib/format/legal-form';
import { formatPlInt, formatPlMoney } from '@/lib/format/pl';
import {
  kpirInvoiceRevenue,
  kpirTotals,
  type KpirExpenseRow,
  type KpirInvoiceRow,
} from '@/lib/reports/kpir-totals';
import { cn } from '@/lib/utils';

export type { KpirExpenseRow, KpirInvoiceRow } from '@/lib/reports/kpir-totals';

const MONTHS = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

interface KpirViewProps {
  month: number;
  year: number;
  expenses: KpirExpenseRow[];
  invoices: KpirInvoiceRow[];
}

function buyerName(buyerData: KpirInvoiceRow['buyer_data']): string {
  if (!buyerData || typeof buyerData !== 'object' || Array.isArray(buyerData)) {
    return '—';
  }
  const name = (buyerData as Record<string, unknown>).name;
  return typeof name === 'string' && name.trim() ? name : '—';
}

function buyerNip(buyerData: KpirInvoiceRow['buyer_data']): string | null {
  if (!buyerData || typeof buyerData !== 'object' || Array.isArray(buyerData)) return null;
  const nip = (buyerData as Record<string, unknown>).nip;
  return typeof nip === 'string' && nip.trim() ? nip : null;
}

const INVOICE_KIND_LABELS: Record<string, string> = {
  regular: 'Sprzedaż',
  advance: 'Zaliczka',
  final: 'Faktura rozliczeniowa',
  correction: 'Korekta sprzedaży',
};

/** Jeden wpis księgi: przychód (faktura) albo koszt (wydatek). */
interface KpirEntry {
  id: string;
  /** Lp. — kolejność w księdze (data zdarzenia, przychody przed kosztami w tym samym dniu). */
  lp: number;
  kind: 'revenue' | 'cost';
  /** RRRR-MM-DD — dzień sprzedaży (kol. 2) albo data dowodu kosztu. */
  date: string;
  dateRemark: string | null;
  documentNumber: string | null;
  counterparty: string;
  counterpartyNip: string | null;
  description: string;
  /** Numer kolumny KPiR: „7”, „10”… */
  column: string;
  amount: number;
  /** Dopisek pod kwotą (rozbicie ROZ, VAT bez odliczenia). */
  amountRemark: string | null;
  href: string;
}

const KIND_LABELS: Record<KpirEntry['kind'], string> = { revenue: 'Przychód', cost: 'Koszt' };

// Kolory grup jak `TRANSACTION_GROUP_STYLES` / kierunki jak `TRANSACTION_DIRECTION_STYLES` w Finorze.
const COLUMN_STYLES: Record<KpirEntry['kind'], string> = {
  // Odstępstwo od Finory (WCAG 1.4.3): chart-2 na chart-2/10 daje 4,44:1 (ciemny 3,60:1).
  revenue: 'bg-chart-2/10 text-accent-foreground',
  // Odstępstwo od Finory (WCAG 1.4.3): tekst `accent-foreground`, nie `primary` — `text-primary` na
  // `bg-primary/10` ma 4,44:1 na karcie i 4,20:1 w zaznaczonym wierszu (jasny motyw);
  // `accent-foreground` daje 9,00 / 8,52:1 (jasny) i 8,93:1 (ciemny).
  cost: 'bg-primary/10 text-accent-foreground',
};
const AMOUNT_STYLES: Record<KpirEntry['kind'], string> = {
  revenue: 'text-green-700 dark:text-green-400',
  cost: 'text-destructive',
};

function buildEntries(invoices: KpirInvoiceRow[], expenses: KpirExpenseRow[], periodStart: string): KpirEntry[] {
  const revenue: Omit<KpirEntry, 'lp'>[] = invoices.map((inv) => {
    const dates = { saleDate: inv.sale_date, issueDate: inv.issue_date };
    return {
      id: `inv-${inv.id}`,
      kind: 'revenue',
      // Data zdarzenia gospodarczego — dzień sprzedaży, jak kol. 2 w eksporcie.
      date: kpirSaleEventDate(dates),
      dateRemark: earlierSaleRemark(dates, periodStart),
      documentNumber: inv.internal_number,
      counterparty: buyerName(inv.buyer_data),
      counterpartyNip: buyerNip(inv.buyer_data),
      description: INVOICE_KIND_LABELS[inv.invoice_kind ?? ''] ?? 'Sprzedaż',
      column: '7',
      amount: kpirInvoiceRevenue(inv),
      amountRemark: inv.invoice_kind === 'final'
        ? `zamówienie ${formatPlMoney(Number(inv.net_total ?? 0))}, minus zaliczki ${formatPlMoney(Number(inv.settled_advances_net ?? 0))}`
        : null,
      href: `/invoices/${inv.id}`,
    };
  });
  const costs: Omit<KpirEntry, 'lp'>[] = expenses.map((exp) => ({
    id: `exp-${exp.id}`,
    kind: 'cost',
    date: exp.issue_date,
    dateRemark: null,
    documentNumber: exp.document_number,
    counterparty: exp.seller_name || '—',
    counterpartyNip: exp.seller_nip,
    description: exp.category_label ?? 'Koszt',
    column: exp.kpir_column?.replace('col_', '') ?? '—',
    amount: kpirCostAmount(exp),
    amountRemark: nonDeductedVat(exp) > 0 ? `w tym VAT bez odliczenia ${formatPlMoney(nonDeductedVat(exp))}` : null,
    href: `/expenses/${exp.id}`,
  }));
  // Stabilne sortowanie: wejście jest już ułożone (data, id) przez stronę.
  return [...revenue, ...costs]
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) =>
      a.entry.date.slice(0, 10).localeCompare(b.entry.date.slice(0, 10)) ||
      (a.entry.kind === b.entry.kind ? 0 : a.entry.kind === 'revenue' ? -1 : 1) ||
      a.index - b.index)
    .map(({ entry }, i) => ({ ...entry, lp: i + 1 }));
}

/** Kwota ze znakiem jak w Finorze: przychód „+”, koszt „−” (minus typograficzny, §7.1). */
function signedMoney(entry: KpirEntry): string {
  // Korekta in minus to ujemny przychód — dostaje „−”, nie „+-”.
  const signed = entry.kind === 'revenue' ? entry.amount : -entry.amount;
  return `${signed < 0 ? '−' : '+'}${formatPlMoney(Math.abs(signed))} zł`;
}

function EntryActions({ entry }: { entry: KpirEntry }) {
  const label = entry.kind === 'revenue' ? 'Szczegóły faktury' : 'Szczegóły wydatku';
  return (
    <div className="flex items-center justify-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={label}
              render={<Link href={entry.href} />}
              nativeButton={false}
            />
          }
        >
          <RiEyeLine className="size-4.5" />
        </TooltipTrigger>
        <TooltipContent>
          <p>Szczegóły</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function ColumnBadge({ entry }: { entry: KpirEntry }) {
  return <Badge className={COLUMN_STYLES[entry.kind]}>Kol. {entry.column}</Badge>;
}

/** Kolumny tabeli KPiR (stałe). Eksport dla testu filtrów „Rodzaj” i „Kolumna”. */
export const KPIR_COLUMNS: ColumnDef<KpirEntry>[] = [
  {
    header: 'Lp.',
    accessorKey: 'lp',
    cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{row.original.lp}</span>,
    size: 70,
  },
  {
    header: 'Data',
    accessorKey: 'date',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-muted-foreground tabular-nums">{formatIsoDatePl(row.original.date)}</span>
        {row.original.dateRemark ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">{row.original.dateRemark}</span>
        ) : null}
      </div>
    ),
    size: 120,
  },
  {
    header: 'Nr dowodu',
    id: 'documentNumber',
    accessorFn: (row) => row.documentNumber ?? '',
    cell: ({ row }) => <span className="font-mono">{row.original.documentNumber ?? '—'}</span>,
    size: 150,
  },
  {
    header: 'Kontrahent',
    id: 'counterparty',
    accessorKey: 'counterparty',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Avatar className="size-9 items-center justify-center">
          <AvatarFallback className="text-xs">{companyInitials(row.original.counterparty)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="max-w-56 truncate font-medium" title={row.original.counterparty}>
            {row.original.counterparty === '—' ? '—' : shortenLegalForm(row.original.counterparty)}
          </span>
          {row.original.counterpartyNip ? (
            <span className="text-muted-foreground font-mono">{row.original.counterpartyNip}</span>
          ) : null}
        </div>
      </div>
    ),
    size: 260,
  },
  {
    header: 'Opis',
    accessorKey: 'description',
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.description}</span>,
    size: 180,
  },
  {
    header: 'Kolumna',
    id: 'column',
    accessorFn: (row) => row.column,
    filterFn: 'equalsString', // filtr select: cała wartość, jak w Finorze
    cell: ({ row }) => <ColumnBadge entry={row.original} />,
    size: 110,
  },
  {
    header: 'Rodzaj',
    id: 'kind',
    accessorKey: 'kind',
    filterFn: 'equalsString',
    enableHiding: true,
  },
  {
    header: 'Kwota',
    id: 'amount',
    accessorFn: (row) => (row.kind === 'revenue' ? row.amount : -row.amount),
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className={cn('font-medium tabular-nums', AMOUNT_STYLES[row.original.kind])}>
          {signedMoney(row.original)}
        </span>
        {row.original.amountRemark ? (
          <span className="text-muted-foreground text-xs">{row.original.amountRemark}</span>
        ) : null}
      </div>
    ),
    size: 170,
  },
  {
    id: 'actions',
    header: () => 'Akcje',
    enableSorting: false,
    cell: ({ row }) => <EntryActions entry={row.original} />,
    size: 90,
  },
];

export function KpirView({ month, year, expenses, invoices }: KpirViewProps) {
  const router = useRouter();
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const navigate = (deltaMonths: number) => {
    const d = new Date(year, month - 1 + deltaMonths, 1);
    router.push(
      `/reports/kpir?month=${d.getMonth() + 1}&year=${d.getFullYear()}`,
    );
  };

  const sums = kpirTotals(expenses, invoices);
  const { totalRevenue, totalExpenses, profit } = sums;
  const entries = useMemo(() => buildEntries(invoices, expenses, periodStart), [invoices, expenses, periodStart]);

  const monthLabel = MONTHS[Math.min(12, Math.max(1, month)) - 1] ?? '';
  const exportHref = `/reports/exports?period=${year}-${String(month).padStart(2, '0')}&format=kpir_excel`;


  // eslint-disable-next-line react-hooks/incompatible-library -- tanstack zwraca funkcje, których React Compiler nie zapamiętuje (jak w Finorze)
  const table = useReactTable({
    data: entries,
    columns: KPIR_COLUMNS,
    state: { columnFilters, globalFilter, pagination, columnVisibility: { kind: false } },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = String(filterValue).toLowerCase();
      return (
        (row.original.documentNumber ?? '').toLowerCase().includes(search) ||
        row.original.counterparty.toLowerCase().includes(search) ||
        row.original.description.toLowerCase().includes(search)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableSortingRemoval: false,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
  });

  const columnLabels: Record<string, string> = Object.fromEntries(
    ['7', '10', '11', '12', '13', '15'].map((c) => [c, `Kol. ${c}`]),
  );

  const stats = [
    { label: 'Przychody (kol. 7–8)', value: `${formatPlMoney(totalRevenue)} zł`, icon: RiArrowLeftDownLine },
    { label: 'Wydatki (kol. 14)', value: `${formatPlMoney(totalExpenses)} zł`, icon: RiArrowRightUpLine },
    {
      label: profit >= 0 ? 'Dochód' : 'Strata',
      value: `${formatPlMoney(profit)} zł`,
      icon: RiScales3Line,
      valueClassName: profit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive',
    },
    { label: 'Wpisy w księdze', value: formatPlInt(entries.length), icon: RiBook2Line },
  ];

  const columnRows: Array<[string, number]> = [
    ['Kol. 10 — Towary handlowe i materiały', sums.col_10],
    ['Kol. 11 — Koszty uboczne zakupu', sums.col_11],
    ['Kol. 12 — Wynagrodzenia', sums.col_12],
    ['Kol. 13 — Pozostałe wydatki', sums.col_13],
    ['Kol. 15 — Koszty B+R', sums.col_15],
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between gap-3 max-sm:flex-col sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Książka Przychodów i Rozchodów</h1>
          <p className="text-muted-foreground text-sm">Automatycznie generowana z faktur i wydatków</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Poprzedni miesiąc">
            <RiArrowLeftSLine aria-hidden />
          </Button>
          <p className="min-w-40 text-center text-sm font-medium">
            {monthLabel} {year}
          </p>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} aria-label="Następny miesiąc">
            <RiArrowRightSLine aria-hidden />
          </Button>
        </div>
      </div>

      <StatsCards stats={stats} iconPosition="right" />

      <Card className="shadow-none">
        <div className="w-full">
          <div className="border-b">
            <div className="flex items-start gap-6 p-4 pt-0 max-lg:flex-col lg:justify-between">
              <div className="flex items-center gap-4">
                <PageSizeSelect table={table} />
                <Link href={exportHref} className={buttonVariants({ variant: 'default' })}>
                  <RiDownload2Line aria-hidden />
                  Eksport KPiR
                </Link>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-4 lg:justify-end">
                <TableSearch
                  value={globalFilter}
                  onChange={setGlobalFilter}
                  placeholder="Szukaj po numerze, kontrahencie, opisie…"
                />
                <ColumnSelectFilter
                  column={table.getColumn('kind')!}
                  labels={KIND_LABELS}
                  allLabel="Przychody i koszty"
                  label="Rodzaj wpisu"
                />
                <ColumnSelectFilter
                  column={table.getColumn('column')!}
                  labels={columnLabels}
                  allLabel="Wszystkie kolumny"
                  label="Kolumna KPiR"
                />
              </div>
            </div>
            <DataTableView
              table={table}
              emptyText="Brak przychodów i wydatków w tym okresie"
              renderCard={(row) => {
                const entry = row.original;
                return (
                  <FinoraListCard
                    title={entry.counterparty === '—' ? '—' : shortenLegalForm(entry.counterparty)}
                    subtitle={entry.documentNumber ?? undefined}
                    amount={<span className={AMOUNT_STYLES[entry.kind]}>{signedMoney(entry)}</span>}
                    amountNote={entry.amountRemark}
                    meta={
                      <>
                        <span>Lp. {entry.lp}</span>
                        <span>{formatIsoDatePl(entry.date)}</span>
                        <ColumnBadge entry={entry} />
                        <span>{entry.description}</span>
                        {entry.dateRemark ? (
                          <span className="text-amber-700 dark:text-amber-400">{entry.dateRemark}</span>
                        ) : null}
                      </>
                    }
                    actions={<EntryActions entry={entry} />}
                  />
                );
              }}
            />
          </div>
          <DataTablePagination table={table} />
        </div>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Wydatki według kolumn KPiR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {columnRows.map(([label, sum]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="shrink-0 font-medium tabular-nums">{formatPlMoney(sum)} zł</span>
            </div>
          ))}
          <Separator />
          <div className="flex items-center justify-between gap-4 pt-3 text-sm">
            <span className="font-medium">Razem (kol. 14)</span>
            <span className="shrink-0 font-semibold tabular-nums">{formatPlMoney(totalExpenses)} zł</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
