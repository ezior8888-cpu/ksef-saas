// lib/validators/invoice-validators.ts
// Walidatory Zod dla wszystkich typów faktur

import { z } from 'zod';
import { validateNipChecksum, validatePeselChecksum } from '@/lib/xml/invoice-calculator';

// ============================================================================
// Helpers walidacyjne
// ============================================================================

/** NIP po polsku - 10 cyfr + checksum mod11 */
const nipSchema = z
  .string()
  .regex(/^\d{10}$/, 'NIP musi mieć 10 cyfr')
  .refine(validateNipChecksum, 'Niepoprawny NIP - błędna suma kontrolna');

/** PESEL - 11 cyfr + checksum */
const peselSchema = z
  .string()
  .regex(/^\d{11}$/, 'PESEL musi mieć 11 cyfr')
  .refine(validatePeselChecksum, 'Niepoprawny PESEL');

export { validatePeselChecksum } from '@/lib/xml/invoice-calculator';

/** Numer faktury - dozwolone znaki alfanumeryczne + / - . */
const invoiceNumberSchema = z
  .string()
  .min(1, 'Numer faktury jest wymagany')
  .max(50, 'Numer max 50 znaków')
  .regex(/^[A-Za-z0-9/.-]+$/, 'Dozwolone tylko: litery, cyfry, /, -, .');

/** Data ISO YYYY-MM-DD */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format daty: YYYY-MM-DD')
  .refine((d) => !Number.isNaN(Date.parse(d)), 'Niepoprawna data');

// ============================================================================
// Pozycja faktury
// ============================================================================

export const invoiceLineSchema = z.object({
  name: z.string().min(1, 'Nazwa wymagana').max(512, 'Max 512 znaków'),
  unit: z.string().min(1, 'Jednostka wymagana').max(20),
  quantity: z.number().positive('Ilość musi być dodatnia'),
  unitPriceNet: z.number().min(0, 'Cena nieujemna'),
  /** Bez `zw` — brak pól P_19 (podstawa zwolnienia) w generatorze. */
  vatRate: z.enum(['23', '8', '5', '0', 'oo', 'np']),
  pkwiuCode: z.string().optional(),
  gtuCode: z.string().optional(),
});

export type InvoiceLineSchema = z.infer<typeof invoiceLineSchema>;

// ============================================================================
// Sprzedawca
// ============================================================================

export const sellerSchema = z.object({
  nip: nipSchema,
  name: z.string().min(1).max(512),
  address: z.object({
    addressLine1: z.string().min(1),
    addressLine2: z.string().min(1),
    countryCode: z.string().length(2).default('PL'),
  }),
  email: z.string().email('Niepoprawny email').optional(),
});

// ============================================================================
// Nabywca - B2B
// ============================================================================

export const buyerB2BSchema = z.object({
  type: z.literal('b2b'),
  idType: z.literal('nip'),
  nip: nipSchema,
  name: z.string().min(1).max(512),
  address: z.object({
    addressLine1: z.string().min(1),
    addressLine2: z.string().min(1),
    countryCode: z.string().length(2),
  }),
  email: z.string().email().optional(),
});

// ============================================================================
// Nabywca - B2C
// ============================================================================

export const buyerB2CSchema = z
  .object({
    type: z.literal('b2c'),
    idType: z.enum(['pesel', 'id_card', 'passport', 'no_id']),
    pesel: peselSchema.optional(),
    idNumber: z.string().min(3).max(20).optional(),
    name: z.string().min(1).max(512),
    address: z.object({
      addressLine1: z.string().min(1),
      addressLine2: z.string().min(1),
      countryCode: z.string().length(2),
    }),
    email: z.string().email().optional(),
  })
  .refine(
    (data) => {
      if (data.idType === 'pesel') return !!data.pesel;
      if (data.idType === 'id_card' || data.idType === 'passport') {
        return !!data.idNumber;
      }
      return true;
    },
    {
      message: 'Wymagany identyfikator dla wybranego typu',
      path: ['pesel'],
    }
  );

export const buyerSchema = z.discriminatedUnion('type', [buyerB2BSchema, buyerB2CSchema]);

// ============================================================================
// Faktura ZWYKŁA
// ============================================================================

export const regularInvoiceSchema = z
  .object({
    invoiceType: z.literal('regular'),
    internalNumber: invoiceNumberSchema,
    issueDate: dateSchema,
    paymentMethod: z.enum(['transfer', 'card', 'cash', 'compensation', 'other']),
    paymentDueDate: dateSchema,
    bankAccount: z.string().regex(/^\d{26}$/, 'Numer konta = 26 cyfr').optional(),
    notes: z.string().max(2000).optional(),

    seller: sellerSchema,
    buyer: buyerSchema,
    lines: z.array(invoiceLineSchema).min(1, 'Min. 1 pozycja').max(100, 'Max 100 pozycji'),
  })
  .refine((data) => new Date(data.paymentDueDate) >= new Date(data.issueDate), {
    message: 'Termin płatności nie może być przed datą wystawienia',
    path: ['paymentDueDate'],
  });

// ============================================================================
// Faktura KORYGUJĄCA
// ============================================================================

export const correctionInvoiceSchema = z
  .object({
    invoiceType: z.literal('correction'),
    internalNumber: invoiceNumberSchema,
    issueDate: dateSchema,
    paymentMethod: z.enum(['transfer', 'card', 'cash', 'compensation', 'other']),
    paymentDueDate: dateSchema,
    bankAccount: z
      .union([z.literal(''), z.string().regex(/^[0-9]{26}$/)])
      .optional(),
    notes: z.string().max(2000).optional(),

    parentInvoiceId: z.string().uuid('Wybierz fakturę pierwotną'),
    parentInvoiceNumber: z.string().min(1),
    parentInvoiceIssueDate: dateSchema,
    parentKsefNumber: z.string().optional(),

    correctionType: z.enum(['before_after', 'amount_change', 'cancellation']),
    correctionReason: z.string().min(5, 'Wymagane uzasadnienie min. 5 znaków').max(500),

    /** MF `TTypKorekty`: 1 skutek okres pierwotny / 2 skutek data korekty / 3 inna. */
    typKorekty: z.enum(['1', '2', '3']).default('2'),

    seller: sellerSchema,
    buyer: buyerSchema,

    linesBefore: z.array(invoiceLineSchema).optional(),
    linesAfter: z.array(invoiceLineSchema).optional(),

    amountChange: z
      .object({
        netDelta: z.number(),
        vatDelta: z.number(),
        grossDelta: z.number(),
        description: z.string().min(1).max(500),
      })
      .optional(),
  })
  .refine(
    (data) => {
      if (data.correctionType === 'before_after') {
        return !!(data.linesBefore?.length && data.linesAfter?.length);
      }
      if (data.correctionType === 'amount_change') {
        return !!data.amountChange;
      }
      return true;
    },
    {
      message: 'Wypełnij dane korekty zgodnie z wybranym typem',
    }
  )
  .refine((data) => new Date(data.paymentDueDate) >= new Date(data.issueDate), {
    message: 'Termin płatności nie może być przed datą wystawienia',
    path: ['paymentDueDate'],
  });

// ============================================================================
// Faktura ZALICZKOWA
// ============================================================================

export const advanceInvoiceSchema = z
  .object({
    invoiceType: z.literal('advance'),
    internalNumber: invoiceNumberSchema,
    issueDate: dateSchema,
    paymentMethod: z.enum(['transfer', 'card', 'cash', 'compensation', 'other']),
    paymentDueDate: dateSchema,
    bankAccount: z
      .union([z.literal(''), z.string().regex(/^\d{26}$/, 'Numer konta = 26 cyfr')])
      .optional(),
    notes: z.string().max(2000).optional(),

    seller: sellerSchema,
    buyer: buyerSchema,

    advanceAmount: z.number().positive('Zaliczka > 0'),
    totalContractAmount: z.number().positive('Wartość umowy > 0'),
    expectedDeliveryDate: dateSchema.optional(),
    vatRate: z.enum(['23', '8', '5', '0']),
    description: z.string().min(5).max(1000),
  })
  .refine((data) => data.advanceAmount <= data.totalContractAmount, {
    message: 'Zaliczka nie może być większa niż wartość umowy',
    path: ['advanceAmount'],
  })
  .refine((data) => new Date(data.paymentDueDate) >= new Date(data.issueDate), {
    message: 'Termin płatności nie może być przed datą wystawienia',
    path: ['paymentDueDate'],
  });

// ============================================================================
// Faktura FINALNA
// ============================================================================

export const finalInvoiceSchema = z
  .object({
    invoiceType: z.literal('final'),
    internalNumber: invoiceNumberSchema,
    issueDate: dateSchema,
    paymentMethod: z.enum(['transfer', 'card', 'cash', 'compensation', 'other']),
    paymentDueDate: dateSchema,
    bankAccount: z
      .union([z.literal(''), z.string().regex(/^\d{26}$/, 'Numer konta = 26 cyfr')])
      .optional(),
    notes: z.string().max(2000).optional(),

    seller: sellerSchema,
    buyer: buyerSchema,

    advanceInvoiceIds: z.array(z.string().uuid()).min(1, 'Wybierz min. 1 zaliczkę'),
    totalAdvances: z.number().nonnegative(),
    lines: z.array(invoiceLineSchema).min(1).max(100),
  })
  .refine((data) => new Date(data.paymentDueDate) >= new Date(data.issueDate), {
    message: 'Termin płatności nie może być przed datą wystawienia',
    path: ['paymentDueDate'],
  });

// ============================================================================
// DISCRIMINATED UNION - cały formularz
// ============================================================================

export const invoiceFormSchema = z.discriminatedUnion('invoiceType', [
  regularInvoiceSchema,
  correctionInvoiceSchema,
  advanceInvoiceSchema,
  finalInvoiceSchema,
]);

export type InvoiceFormSchemaType = z.infer<typeof invoiceFormSchema>;

export type CorrectionInvoiceSchemaIn = z.infer<typeof correctionInvoiceSchema>;
export type AdvanceInvoiceSchemaIn = z.infer<typeof advanceInvoiceSchema>;
export type FinalInvoiceSchemaIn = z.infer<typeof finalInvoiceSchema>;
