'use client'

import { useId, useMemo, type ReactNode } from 'react'

import { flexRender, type Column, type Row, type Table as TanstackTable } from '@tanstack/react-table'
import {
  RiArrowDownSLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowUpSLine,
  RiSearchLine
} from '@remixicon/react'

import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from '@/components/ui/pagination'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePagination } from '@/hooks/use-pagination'
import { cn } from '@/lib/utils'

/**
 * Części data-table Finory (`views/pages/transactions/transaction-table/data-table.tsx`,
 * `invoices-reminders/reminder-table/data-table.tsx`) wyjęte 1:1, żeby
 * Przypomnienia, KPiR i portal księgowej miały ten sam znacznik: „Pokaż N”,
 * wyszukiwarka `InputGroup`, filtr kolumny `Select`, nagłówek z sortowaniem,
 * wiersze `h-14`, stopka „Pozycje X–Y z N” i paginacja Poprzednia/Następna.
 *
 * Jedyna zmiana względem Finory: poniżej `lg` zamiast tabeli idą karty
 * (plan §7.2 — przewijanie tabeli w bok na 375 px to błąd). Karty pokazują
 * te same wiersze tej samej strony, więc filtry i paginacja działają też na
 * telefonie.
 */

export const PAGE_SIZES = [5, 10, 25, 50] as const

/** „Pokaż [10]” — rozmiar strony tabeli. */
export function PageSizeSelect<T>({ table, label = 'Pokaż' }: { table: TanstackTable<T>; label?: string }) {
  const id = useId()
  return (
    <div className='flex items-center gap-2'>
      <Label htmlFor={id} className='text-muted-foreground text-base font-normal max-sm:sr-only'>
        {label}
      </Label>
      <Select
        items={PAGE_SIZES.map(s => ({ label: String(s), value: String(s) }))}
        value={table.getState().pagination.pageSize.toString()}
        onValueChange={(value: string | null) => {
          if (value) table.setPageSize(Number(value))
        }}
      >
        <SelectTrigger id={id} className='w-fit whitespace-nowrap' aria-label='Liczba pozycji na stronie'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className='p-0.5' alignItemWithTrigger={false}>
          <SelectGroup>
            {PAGE_SIZES.map(size => (
              <SelectItem key={size} value={size.toString()}>
                {size}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

/** Wyszukiwarka nad tabelą (`globalFilter`). */
export function TableSearch({
  value,
  onChange,
  placeholder,
  className
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('w-full sm:max-w-xs', className)}>
      <Label htmlFor={id} className='sr-only'>
        Szukaj
      </Label>
      <InputGroup>
        <InputGroupAddon>
          <RiSearchLine />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          type='text'
        />
      </InputGroup>
    </div>
  )
}

/** Filtr wartości kolumny (Finora `Filter`, wariant `select`) z polskimi etykietami. */
export function ColumnSelectFilter<T>({
  column,
  labels,
  allLabel,
  label
}: {
  column: Column<T, unknown>
  labels?: Record<string, string>
  allLabel: string
  /** Etykieta dla czytnika ekranu. */
  label: string
}) {
  const id = useId()
  const columnFilterValue = column.getFilterValue()
  const facetedUniqueValues = column.getFacetedUniqueValues()

  const sortedUniqueValues = useMemo(() => {
    const values = Array.from(facetedUniqueValues.keys())
    const flattened = values.reduce((acc: string[], curr) => {
      if (Array.isArray(curr)) return [...acc, ...curr.map(String)]
      return [...acc, String(curr)]
    }, [])
    return Array.from(new Set(flattened)).sort()
  }, [facetedUniqueValues])

  const labelFor = (value: string) => labels?.[value] ?? value

  return (
    <div className='w-full sm:max-w-44'>
      <Label htmlFor={`${id}-select`} className='sr-only'>
        {label}
      </Label>
      <Select
        items={[
          { label: allLabel, value: 'all' },
          ...sortedUniqueValues.map(value => ({ label: labelFor(value), value }))
        ]}
        value={columnFilterValue?.toString() ?? 'all'}
        onValueChange={(value: string | null) => {
          column.setFilterValue(value === 'all' || value === null ? undefined : value)
        }}
      >
        <SelectTrigger id={`${id}-select`} className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className='p-1' alignItemWithTrigger={false}>
          <SelectGroup>
            <SelectItem value='all'>{allLabel}</SelectItem>
            {sortedUniqueValues.map(value => (
              <SelectItem key={value} value={value}>
                {labelFor(value)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Tabela Finory od `lg` + karty poniżej. `renderCard` dostaje ten sam wiersz
 * tanstacka co komórki tabeli.
 */
export function DataTableView<T>({
  table,
  renderCard,
  emptyText = 'Brak wyników.'
}: {
  table: TanstackTable<T>
  renderCard: (row: Row<T>) => ReactNode
  emptyText?: string
}) {
  const rows = table.getRowModel().rows
  const columnCount = table.getVisibleLeafColumns().length

  return (
    <>
      <div className='hidden lg:block'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='h-14 border-t'>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    style={{ width: `${header.getSize()}px` }}
                    className='text-muted-foreground first:pl-4 last:px-4 last:text-center'
                    // Odstępstwo od Finory (WCAG 4.1.2): kierunek sortowania dla czytnika.
                    aria-sort={
                      header.column.getCanSort()
                        ? (({ asc: 'ascending', desc: 'descending' } as const)[
                            header.column.getIsSorted() as 'asc' | 'desc'
                          ] ?? 'none')
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <div
                        className='flex h-full cursor-pointer items-center justify-between gap-2 select-none'
                        onClick={header.column.getToggleSortingHandler()}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            header.column.getToggleSortingHandler()?.(e)
                          }
                        }}
                        role='button'
                        tabIndex={0}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <RiArrowUpSLine className='size-4 shrink-0 opacity-60' aria-hidden='true' />,
                          desc: <RiArrowDownSLine className='size-4 shrink-0 opacity-60' aria-hidden='true' />
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map(row => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className='h-14 first:pl-4'>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columnCount} className='h-24 text-center'>
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className='divide-y border-t lg:hidden'>
        {rows.length ? (
          rows.map(row => <div key={row.id}>{renderCard(row)}</div>)
        ) : (
          <p className='text-muted-foreground px-4 py-10 text-center text-sm'>{emptyText}</p>
        )}
      </div>
    </>
  )
}

/** Stopka: „Pozycje X–Y z N” + paginacja Finory (Poprzednia / numery / Następna). */
export function DataTablePagination<T>({ table }: { table: TanstackTable<T> }) {
  const { pageIndex, pageSize } = table.getState().pagination
  const total = table.getRowCount()
  const first = total === 0 ? 0 : pageIndex * pageSize + 1
  const last = Math.min(pageIndex * pageSize + pageSize, total)

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: pageIndex + 1,
    totalPages: table.getPageCount(),
    paginationItemsToDisplay: 2
  })

  return (
    <div className='flex items-center justify-between gap-3 p-4 pb-0 max-sm:flex-col md:max-lg:flex-col'>
      <p className='text-muted-foreground text-sm whitespace-nowrap' aria-live='polite'>
        {total === 0 ? (
          'Brak pozycji'
        ) : (
          <>
            Pozycje{' '}
            <span>
              {first}–{last}
            </span>{' '}
            z <span>{total.toString()}</span>
          </>
        )}
      </p>

      <div>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Button
                className='disabled:pointer-events-none disabled:opacity-50'
                variant='ghost'
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label='Poprzednia strona'
              >
                <RiArrowLeftSLine aria-hidden='true' />
                Poprzednia
              </Button>
            </PaginationItem>

            {showLeftEllipsis && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}

            {pages.map(page => {
              const isActive = page === pageIndex + 1

              return (
                <PaginationItem key={page}>
                  <Button
                    size='icon'
                    className={cn(
                      !isActive &&
                        'bg-primary/10 text-primary hover:bg-primary/20 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40'
                    )}
                    onClick={() => table.setPageIndex(page - 1)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={`Strona ${page}`}
                  >
                    {page}
                  </Button>
                </PaginationItem>
              )
            })}

            {showRightEllipsis && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}

            <PaginationItem>
              <Button
                className='disabled:pointer-events-none disabled:opacity-50'
                variant='ghost'
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label='Następna strona'
              >
                Następna
                <RiArrowRightSLine aria-hidden='true' />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

/**
 * Wiersz tabeli jako karta na telefonie (w stylu karty Finory, jak lista
 * faktur z E3): tytuł i kwota w jednym rzędzie, pod spodem szczegóły i akcje.
 */
export function FinoraListCard({
  title,
  subtitle,
  amount,
  amountNote,
  meta,
  actions,
  leading
}: {
  title: ReactNode
  subtitle?: ReactNode
  amount?: ReactNode
  amountNote?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  /** Awatar albo ikona statusu przed tytułem. */
  leading?: ReactNode
}) {
  return (
    <div className='p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-1 items-center gap-3'>
          {leading}
          <div className='min-w-0'>
            <p className='text-foreground truncate text-sm font-medium'>{title}</p>
            {subtitle ? <p className='text-muted-foreground truncate font-mono text-xs'>{subtitle}</p> : null}
          </div>
        </div>
        {amount !== undefined ? (
          <div className='shrink-0 text-right'>
            <p className='text-sm font-medium tabular-nums'>{amount}</p>
            {amountNote ? <p className='text-muted-foreground text-xs'>{amountNote}</p> : null}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className='text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>{meta}</div>
      ) : null}
      {actions ? <div className='mt-3 flex flex-wrap items-center gap-2'>{actions}</div> : null}
    </div>
  )
}
