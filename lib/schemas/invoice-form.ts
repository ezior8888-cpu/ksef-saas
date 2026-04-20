import { z } from 'zod';
import { validateNipChecksum } from '@/lib/xml/invoice-calculator';

// UWAGA: typ VatRate w types/invoice.ts nie zawiera '3' (stawka ryczałtu
// rolnika ryczałtowego). Trzymamy się tego samego zestawu, żeby
// calculateLineItem/getVatPercentage nie traciły type-safety. '3' da się
// dodać jednym punktem w types/invoice.ts + mapping w invoice-calculator.
export const vatRateEnum = z.enum(['23', '8', '5', '0', 'zw', 'oo', 'np']);

// UWAGA: quantity/unitPriceNet to `z.number()` (nie `z.coerce.number()`).
// RHF zadba o konwersję string→number przez `{ valueAsNumber: true }`.
// Puste pole number → `NaN`; `z.number()` w Zod odrzuca NaN — wtedy
// walidacja się nie udaje — MUSIMY pokazać toast w `handleSubmit` onInvalid
// (invoice-form.tsx), inaczej wygląda to jak „guzik nie działa”.

export const lineItemSchema = z.object({
  name: z.string().min(1, 'Nazwa wymagana').max(512, 'Maksymalnie 512 znaków'),
  unit: z.string().min(1, 'Podaj jednostkę'),
  quantity: z.number().positive('Ilość musi być > 0'),
  unitPriceNet: z.number().nonnegative('Cena nie może być ujemna'),
  vatRate: vatRateEnum,
});

export const invoiceFormSchema = z.object({
  internalNumber: z.string().min(1, 'Numer faktury wymagany').max(50),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: RRRR-MM-DD'),
  /** Pusta lub prawidłowa data — sam regex na opcjonalnym stringu psuł `''` w Zod. */
  saleDate: z.union([
    z.literal(''),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data sprzedaży: RRRR-MM-DD'),
  ]),
  buyerNip: z
    .string()
    .regex(/^\d{10}$/, 'NIP: 10 cyfr')
    .refine(validateNipChecksum, 'Nieprawidłowa suma kontrolna NIP'),
  buyerName: z.string().min(1, 'Nazwa wymagana'),
  buyerAddressLine1: z.string().min(1, 'Adres — linia 1 wymagana'),
  buyerAddressLine2: z.string().min(1, 'Adres — linia 2 wymagana'),
  /** Pusty string musi być w union — inaczej `.email()` na `''` blokuje submit. */
  buyerEmail: z.union([
    z.literal(''),
    z.string().email('Nieprawidłowy adres e-mail'),
  ]),
  lines: z.array(lineItemSchema).min(1, 'Dodaj co najmniej jedną pozycję'),
  paymentMethod: z.enum(['transfer', 'cash', 'card', 'other']),
  paymentDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bankAccount: z.string().optional(),
  notes: z.string().max(3500).optional(),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
