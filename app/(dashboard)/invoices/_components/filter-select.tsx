'use client';

import { useRouter } from 'next/navigation';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { invoiceListHref, INVOICE_PAGE_SIZES, type InvoiceListParams } from '@/lib/invoices/list-query';

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Select Finory w formularzu GET. Base UI renderuje ukryte `<input name>`,
 * więc „Filtruj” wysyła wartość także bez JS (po hydracji to ten sam wybór).
 */
export function FilterSelect({
  name,
  label,
  value,
  options,
  className,
}: {
  name: string;
  label: string;
  value: string;
  options: FilterOption[];
  className?: string;
}) {
  return (
    <Select name={name} defaultValue={value} items={options}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** „Pokaż 10/25/50” — zmiana od razu przeładowuje listę (`na_stronie`, strona 1); bez JS działa „Filtruj”. */
export function PerPageSelect({ params, className }: { params: InvoiceListParams; className?: string }) {
  const router = useRouter();
  const options: FilterOption[] = INVOICE_PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }));
  return (
    <Select
      name="na_stronie"
      defaultValue={String(params.perPage)}
      items={options}
      onValueChange={(next) => {
        const perPage = INVOICE_PAGE_SIZES.find((n) => String(n) === next);
        if (perPage !== undefined && perPage !== params.perPage) {
          router.push(invoiceListHref(params, { perPage }));
        }
      }}
    >
      <SelectTrigger aria-label="Liczba faktur na stronie" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
