import { z } from 'zod';

import { sanitizeSearch } from '@/lib/invoices/list-query';

/**
 * Kontrahenci — edycja, usuwanie i wyszukiwanie (F-011 w raporcie audytu
 * bloku 1). Do 02.10.2026 baza kontrahentów była tylko pamięcią wyszukiwań
 * w GUS: bez edycji, usuwania i wyszukiwania, a dane z GUS nigdy się nie
 * odświeżały i nie dało się ich poprawić.
 */

const XML_FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;
const NO_CONTROL_CHARS_MESSAGE = 'Usuń niewidoczne znaki sterujące (np. wklejone z Worda)';

const text = (min: number, required: string) =>
  z
    .string()
    .refine((v) => !XML_FORBIDDEN_CHARS.test(v), NO_CONTROL_CHARS_MESSAGE)
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(min, required).max(512, 'Maksymalnie 512 znaków'));

export const contractorEditSchema = z.object({
  name: text(1, 'Podaj nazwę kontrahenta'),
  addressLine1: text(0, ''),
  addressLine2: text(0, ''),
  email: z.union([z.literal(''), z.string().trim().email('Nieprawidłowy adres e-mail')]),
});

export type ContractorEditInput = z.input<typeof contractorEditSchema>;
export type ContractorEdit = z.output<typeof contractorEditSchema>;

/**
 * Pola poprawione ręcznie — trafiają do `contractors.manual_fields` (00064),
 * żeby nocne odświeżanie z rejestrów nie cofnęło poprawki klienta.
 */
export function changedContractorFields(
  before: { name: string | null; address: { addressLine1?: string; addressLine2?: string } | null; email: string | null },
  after: ContractorEdit,
): Array<'name' | 'address' | 'email'> {
  const changed: Array<'name' | 'address' | 'email'> = [];
  if ((before.name ?? '') !== after.name) changed.push('name');
  if (
    (before.address?.addressLine1 ?? '') !== after.addressLine1 ||
    (before.address?.addressLine2 ?? '') !== after.addressLine2
  ) {
    changed.push('address');
  }
  if ((before.email ?? '') !== after.email) changed.push('email');
  return changed;
}

/** Warunek `or()` wyszukiwania kontrahentów: nazwa albo NIP. `null` = bez frazy. */
export function contractorSearchFilter(q: string): string | null {
  const term = sanitizeSearch(q);
  if (!term) return null;
  const parts = [`name.ilike.%${term}%`];
  const digits = term.replace(/[\s-]/g, '');
  if (/^\d{2,10}$/.test(digits)) parts.push(`nip.ilike.%${digits}%`);
  return parts.join(',');
}
