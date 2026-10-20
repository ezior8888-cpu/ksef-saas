import Link from 'next/link';
import { RiSearchLine } from '@remixicon/react';

import { BatchPdfDownload } from '@/components/invoices/batch-pdf-download';
import { Button, buttonVariants } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import {
  INVOICE_KIND_FILTERS,
  INVOICE_PAYMENT_FILTERS,
  INVOICE_PAGE_SIZE,
  INVOICE_STATUS_FILTERS,
  invoiceListHref,
  type InvoiceListParams,
} from '@/lib/invoices/list-query';

import { FilterSelect, PerPageSelect, type FilterOption } from './filter-select';

const toOptions = (dict: Record<string, { label: string }>): FilterOption[] =>
  Object.entries(dict).map(([value, f]) => ({ value, label: f.label }));

/**
 * Pasek listy faktur 1:1 z Finory (`invoice-table/data-table.tsx`): po lewej
 * „Pokaż N” i „Wystaw fakturę”, po prawej wyszukiwarka i filtr statusu
 * (`flex gap-6 p-4 pt-0 max-lg:flex-col lg:items-center lg:justify-between`).
 * Nasze dodatki stoją w tym samym rzędzie i zawijają się jak filtry Finory:
 * filtry „Płatność” i „Rodzaj”, daty wystawienia, „Filtruj”/„Wyczyść” oraz
 * paczka PDF za miesiąc (po lewej, przy „Wystaw fakturę”).
 *
 * Konieczność (lista nie mieści się w pamięci przeglądarki): to zwykły
 * formularz GET na `/invoices` — działa bez JS, adres niesie wszystkie filtry
 * (`q`, `status`, `platnosc`, `rodzaj`, `od`, `do`, `na_stronie`), a „Filtruj”
 * zawsze wraca na stronę 1.
 *
 * Pola są niekontrolowane (`defaultValue`; Base UI czyta go tylko raz), a
 * „Wyczyść”, „Wyczyść filtry”, „Pokaż N” i Wstecz to miękka nawigacja w tym
 * samym segmencie — Next nie remontuje wtedy paska. Dlatego formularz ma
 * klucz z adresu listy bez numeru strony (przejście na kolejną stronę nie
 * kasuje wpisywanej frazy) i bez „Pokaż N” (wybór liczby wierszy nie zabiera
 * fokusu z pola — `PerPageSelect` sam idzie za adresem): zmiana filtrów
 * odtwarza pola z adresu, który jest właścicielem stanu (PLAN-FINORA P3).
 */
export function InvoicesToolbar({ params, filtered }: { params: InvoiceListParams; filtered: boolean }) {
  return (
    <form
      key={invoiceListHref(params, { page: 1, perPage: INVOICE_PAGE_SIZE })}
      method="get"
      action="/invoices"
      className="flex gap-6 p-4 pt-0 max-lg:flex-col lg:items-center lg:justify-between"
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="rowSelect" className="text-muted-foreground text-base font-normal max-sm:sr-only">
            Pokaż
          </Label>
          <PerPageSelect params={params} id="rowSelect" />
        </div>
        <Link href="/invoices/new" className={buttonVariants({ variant: 'default' })}>
          Wystaw fakturę
        </Link>
        <BatchPdfDownload />
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-4 lg:justify-end">
        <div className="w-full max-w-2xs">
          <Label htmlFor="invoice-search" className="sr-only">
            Szukaj
          </Label>
          <InputGroup>
            <InputGroupAddon>
              <RiSearchLine aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              id="invoice-search"
              name="q"
              type="search"
              defaultValue={params.q}
              placeholder="Szukaj po numerze lub kontrahencie"
              aria-label="Szukaj po numerze lub kontrahencie"
            />
          </InputGroup>
        </div>
        <FilterSelect name="status" label="Status KSeF" value={params.status} options={toOptions(INVOICE_STATUS_FILTERS)} />
        <FilterSelect
          name="platnosc"
          label="Płatność"
          value={params.payment}
          options={toOptions(INVOICE_PAYMENT_FILTERS)}
          className="sm:max-w-52"
        />
        <FilterSelect
          name="rodzaj"
          label="Rodzaj"
          value={params.kind}
          options={toOptions(INVOICE_KIND_FILTERS)}
          className="sm:max-w-52"
        />
        <DateField name="od" label="Wystawione od" addon="Od" value={params.from} />
        <DateField name="do" label="Wystawione do" addon="Do" value={params.to} />
        <div className="flex gap-2">
          <Button type="submit">Filtruj</Button>
          {filtered ? (
            <Link href="/invoices" className={buttonVariants({ variant: 'outline' })}>
              Wyczyść
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  );
}

/** Data wystawienia w oprawie wyszukiwarki Finory (`InputGroup` z dodatkiem po lewej). */
function DateField({ name, label, addon, value }: { name: string; label: string; addon: string; value: string | null }) {
  const id = `filtr-${name}`;
  return (
    <div className="w-full sm:max-w-44">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>{addon}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput id={id} type="date" name={name} defaultValue={value ?? ''} />
      </InputGroup>
    </div>
  );
}
