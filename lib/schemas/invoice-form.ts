import { z } from 'zod';
import {
  validateNipChecksum,
  validatePeselChecksum,
} from '@/lib/xml/invoice-calculator';

// UWAGA: typ VatRate w types/invoice.ts nie zawiera '3' (stawka ryczałtu
// rolnika ryczałtowego). Trzymamy się tego samego zestawu, żeby
// calculateLineItem/getVatPercentage nie traciły type-safety. '3' da się
// dodać jednym punktem w types/invoice.ts + mapping w invoice-calculator.
/** Bez `zw` — wymaga P_19A/B/C w FA(3); wróci z UI na podstawę prawną. */
export const vatRateEnum = z.enum(['23', '8', '5', '0', 'oo', 'np']);

export const buyerConsumerIdTypeEnum = z.enum([
  'pesel',
  'id_card',
  'passport',
  'no_id',
]);

const consumerIdChoices = buyerConsumerIdTypeEnum.enum;

// UWAGA: quantity/unitPriceNet to `z.number()` (nie `z.coerce.number()`).
// RHF zadba o konwersję string→number przez `{ valueAsNumber: true }`.
// Puste pole number → `NaN`; `z.number()` w Zod odrzuca NaN — wtedy
// walidacja się nie udaje — MUSIMY pokazać toast w `handleSubmit` onInvalid

export const lineItemSchema = z.object({
  name: z.string().min(1, 'Nazwa wymagana').max(512, 'Maksymalnie 512 znaków'),
  unit: z.string().min(1, 'Podaj jednostkę'),
  quantity: z.number().positive('Ilość musi być > 0'),
  unitPriceNet: z.number().nonnegative('Cena nie może być ujemna'),
  vatRate: vatRateEnum,
});

export const invoiceFormSchema = z
  .object({
    internalNumber: z.string().min(1, 'Numer faktury wymagany').max(50),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: RRRR-MM-DD'),
    saleDate: z.union([
      z.literal(''),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data sprzedaży: RRRR-MM-DD'),
    ]),
    /** Dla firm — 10 cyfr + checksum (walidacja gdy buyerIsConsumer=false). */
    buyerNip: z.string(),
    buyerName: z.string().min(1, 'Nazwa wymagana'),
    buyerAddressLine1: z.string().min(1, 'Adres — linia 1 wymagana'),
    buyerAddressLine2: z.string().min(1, 'Adres — linia 2 wymagana'),
    buyerEmail: z.union([
      z.literal(''),
      z.string().email('Nieprawidłowy adres e-mail'),
    ]),
    buyerIsConsumer: z.boolean(),
    buyerConsumerIdType: buyerConsumerIdTypeEnum.optional(),
    buyerPesel: z.string(),
    buyerIdDocument: z.string(),
    lines: z.array(lineItemSchema).min(1, 'Dodaj co najmniej jedną pozycję'),
    paymentMethod: z.enum(['transfer', 'cash', 'card', 'other']),
    paymentDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bankAccount: z.string().optional(),
    notes: z.string().max(3500).optional(),
  })
  .refine(
    (d) =>
      !!d.buyerIsConsumer ||
      (/^\d{10}$/.test(d.buyerNip) &&
        validateNipChecksum(d.buyerNip)),
    { message: 'NIP firmy — 10 cyfr i suma kontrolna', path: ['buyerNip'] },
  )
  .refine((d) => !d.buyerIsConsumer || !!d.buyerConsumerIdType, {
    message: 'Wybierz typ identyfikatora osoby fizycznej',
    path: ['buyerConsumerIdType'],
  })
  .refine(
    (d) => {
      if (!d.buyerIsConsumer || d.buyerConsumerIdType !== consumerIdChoices.pesel) {
        return true;
      }
      const peselDigits = d.buyerPesel.replace(/\D/g, '');
      return validatePeselChecksum(peselDigits);
    },
    { message: 'Nieprawidłowy PESEL (11 cyfr, suma kontrolna)', path: ['buyerPesel'] },
  )
  .refine(
    (d) => {
      if (!d.buyerIsConsumer) return true;
      const t = d.buyerConsumerIdType;
      if (t !== consumerIdChoices.id_card && t !== consumerIdChoices.passport) return true;
      return (d.buyerIdDocument?.trim().length ?? 0) >= 3;
    },
    {
      message: 'Podaj numer dokumentu (min. 3 znaki)',
      path: ['buyerIdDocument'],
    },
  )
  .refine((d) => new Date(d.paymentDueDate) >= new Date(d.issueDate), {
    message: 'Termin płatności nie może być przed datą wystawienia',
    path: ['paymentDueDate'],
  })
  .refine(
    (d) =>
      !d.saleDate ||
      d.saleDate === '' ||
      new Date(d.saleDate).getTime() <= new Date(d.issueDate).getTime(),
    {
      message: 'Data sprzedaży nie może być późniejsza niż data wystawienia',
      path: ['saleDate'],
    },
  );

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
