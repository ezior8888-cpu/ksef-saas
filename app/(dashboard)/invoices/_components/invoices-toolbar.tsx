import type { ReactNode } from 'react';
import Link from 'next/link';
import { RiAddLine, RiSearchLine } from '@remixicon/react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  INVOICE_KIND_FILTERS,
  INVOICE_PAYMENT_FILTERS,
  INVOICE_STATUS_FILTERS,
  type InvoiceListParams,
} from '@/lib/invoices/list-query';
import { cn } from '@/lib/utils';

import { FilterSelect, PerPageSelect, type FilterOption } from './filter-select';

const toOptions = (dict: Record<string, { label: string }>): FilterOption[] =>
  Object.entries(dict).map(([value, f]) => ({ value, label: f.label }));

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('text-muted-foreground flex flex-col gap-1.5 text-xs', className)}>
      {label}
      {children}
    </label>
  );
}

/**
 * Pasek listy faktur (Finora: „Pokaż”, szukanie, filtry, „Wystaw fakturę”).
 * To zwykły formularz GET na `/invoices` — działa bez JS, adres niesie
 * wszystkie filtry (`q`, `status`, `platnosc`, `rodzaj`, `od`, `do`,
 * `na_stronie`), a „Filtruj” zawsze wraca na stronę 1.
 */
export function InvoicesToolbar({ params, filtered }: { params: InvoiceListParams; filtered: boolean }) {
  return (
    <form method="get" action="/invoices" className="space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Pokaż">
          <PerPageSelect params={params} className="w-20" />
        </Field>
        <Field label="Szukaj" className="min-w-56 flex-1 sm:max-w-sm">
          <InputGroup>
            <InputGroupAddon>
              <RiSearchLine aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              name="q"
              type="search"
              defaultValue={params.q}
              placeholder="Szukaj po numerze lub kontrahencie"
              aria-label="Szukaj po numerze lub kontrahencie"
            />
          </InputGroup>
        </Field>
        <Link href="/invoices/new" className={cn(buttonVariants({ variant: 'default' }), 'ml-auto')}>
          <RiAddLine aria-hidden />
          Wystaw fakturę
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Status KSeF">
          <FilterSelect
            name="status"
            label="Status KSeF"
            value={params.status}
            options={toOptions(INVOICE_STATUS_FILTERS)}
            className="w-44"
          />
        </Field>
        <Field label="Płatność">
          <FilterSelect
            name="platnosc"
            label="Płatność"
            value={params.payment}
            options={toOptions(INVOICE_PAYMENT_FILTERS)}
            className="w-36"
          />
        </Field>
        <Field label="Rodzaj">
          <FilterSelect
            name="rodzaj"
            label="Rodzaj"
            value={params.kind}
            options={toOptions(INVOICE_KIND_FILTERS)}
            className="w-36"
          />
        </Field>
        <Field label="Wystawione od">
          <Input type="date" name="od" defaultValue={params.from ?? ''} className="w-40" />
        </Field>
        <Field label="Wystawione do">
          <Input type="date" name="do" defaultValue={params.to ?? ''} className="w-40" />
        </Field>
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
