// Schema TypeScript + JSON dla strukturyzowanego output z Claude Vision

import { z } from 'zod';

export const extractedInvoiceSchema = z.object({
  seller_name: z.string().describe('Pełna nazwa sprzedawcy z faktury'),
  seller_nip: z
    .union([
      z.string().regex(/^\d{10}$/, 'NIP musi mieć dokładnie 10 cyfr'),
      z.null(),
    ])
    .describe('NIP 10 cyfr bez spacji/myślników, lub null dla paragonu <450 PLN'),
  seller_address: z.string().nullable().describe('Pełny adres sprzedawcy'),

  document_number: z.string().describe('Numer faktury / paragonu'),
  document_type: z
    .enum(['invoice', 'receipt', 'simplified_invoice', 'other'])
    .describe(
      'invoice = faktura VAT, receipt = paragon, simplified_invoice = faktura uproszczona <450 PLN'
    ),
  issue_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('Data wystawienia w formacie YYYY-MM-DD'),

  net_amount: z.number().nonnegative().describe('Kwota netto w PLN'),
  vat_amount: z.number().nonnegative().describe('Kwota VAT w PLN'),
  gross_amount: z.number().positive().describe('Kwota brutto w PLN'),
  vat_rate: z
    .enum(['23', '8', '5', '0', 'zw', 'oo', 'np', 'mixed'])
    .describe('Stawka VAT, "mixed" jeśli różne stawki na fakturze'),

  line_items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().nullable(),
        unit_price: z.number().nullable(),
        gross: z.number().nullable(),
      })
    )
    .nullable(),

  ocr_confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'Pewność rozpoznania - 0 jeśli niewyraźne, 1 jeśli idealnie czytelne'
    ),

  notes: z
    .string()
    .nullable()
    .describe('Uwagi - np. "zdjęcie obcięte", "tekst zamazany"'),
});

export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;

export const claudeOutputInstructions = `
Zwróć STRICT JSON o następującej strukturze. Wartości w PLN. Daty YYYY-MM-DD.

{
  "seller_name": "Pełna nazwa sprzedawcy",
  "seller_nip": "10 cyfr lub null jeśli paragon <450 PLN",
  "seller_address": "Adres lub null",
  "document_number": "Numer faktury/paragonu",
  "document_type": "invoice | receipt | simplified_invoice | other",
  "issue_date": "YYYY-MM-DD",
  "net_amount": 0.00,
  "vat_amount": 0.00,
  "gross_amount": 0.00,
  "vat_rate": "23 | 8 | 5 | 0 | zw | oo | np | mixed",
  "line_items": [
    {"name": "Nazwa pozycji", "quantity": 1, "unit_price": 0.00, "gross": 0.00}
  ] lub null,
  "ocr_confidence": 0.95,
  "notes": "Uwagi lub null"
}

Zasady:
- NIP: 10 cyfr ciągiem, bez spacji/myślników. Jeśli na paragonie nie ma - daj null.
- Daty: ZAWSZE format YYYY-MM-DD (np. "2026-04-15"), nie "15.04.2026".
- Kwoty: liczby (NIE stringi). Kropka jako separator dziesiętny. NIE dodawaj "PLN".
- vat_rate "mixed" gdy różne stawki w pozycjach.
- vat_rate "zw" dla zwolnionych z VAT (np. księgowi, lekarze).
- Jeśli zdjęcie jest niewyraźne lub coś nie do odczytania - daj odpowiednie pole jako null + opisz w "notes".
- ocr_confidence: 1.0 gdy wszystko czytelne, 0.5 gdy brakuje pojedynczych pól, <0.3 gdy katastrofa.
- Sprawdź matematykę: net + vat ≈ gross. Jeśli się nie zgadza, w "notes" napisz dlaczego.

ZWRACAJ TYLKO JSON. Bez backticków, bez komentarzy, bez wyjaśnień.
`;
