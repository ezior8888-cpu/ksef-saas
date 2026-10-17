import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { usePagination } from '@/hooks/use-pagination';
import { invoiceListHref, type InvoiceListParams } from '@/lib/invoices/list-query';
import { cn } from '@/lib/utils';

const DISABLED = 'pointer-events-none opacity-50';

/**
 * Stopka listy: „Pozycje X–Y z N” i paginacja Finory jako ZWYKŁE LINKI
 * (`invoiceListHref` zachowuje filtry, `na_stronie` i szukaną frazę) —
 * działa bez JS i w nowych kartach. Serwer jest właścicielem strony.
 */
export function InvoicesPagination({ params, total }: { params: InvoiceListParams; total: number }) {
  const pages = Math.max(1, Math.ceil(total / params.perPage));
  const current = Math.min(params.page, pages);
  const first = total === 0 ? 0 : (current - 1) * params.perPage + 1;
  const last = Math.min(total, current * params.perPage);
  const { pages: window, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: current,
    totalPages: pages,
    paginationItemsToDisplay: 5,
  });
  const href = (page: number) => invoiceListHref(params, { page });

  return (
    <div className="flex flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {total === 0 ? 'Brak pozycji' : `Pozycje ${first}–${last} z ${total}`}
      </p>
      {pages > 1 ? (
        <Pagination aria-label="Strony listy faktur" className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              {current > 1 ? (
                <PaginationPrevious href={href(current - 1)} />
              ) : (
                <PaginationPrevious aria-disabled="true" tabIndex={-1} className={DISABLED} />
              )}
            </PaginationItem>
            {window[0] !== undefined && window[0] > 1 ? (
              <PaginationItem>
                <PaginationLink href={href(1)} aria-label="Strona 1">
                  1
                </PaginationLink>
              </PaginationItem>
            ) : null}
            {showLeftEllipsis ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
            {window.map((page) => (
              <PaginationItem key={page}>
                <PaginationLink href={href(page)} isActive={page === current} aria-label={`Strona ${page}`}>
                  {page}
                </PaginationLink>
              </PaginationItem>
            ))}
            {showRightEllipsis ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
            {window[window.length - 1] !== undefined && (window[window.length - 1] as number) < pages ? (
              <PaginationItem>
                <PaginationLink href={href(pages)} aria-label={`Strona ${pages}`}>
                  {pages}
                </PaginationLink>
              </PaginationItem>
            ) : null}
            <PaginationItem>
              {current < pages ? (
                <PaginationNext href={href(current + 1)} />
              ) : (
                <PaginationNext aria-disabled="true" tabIndex={-1} className={cn(DISABLED)} />
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}
