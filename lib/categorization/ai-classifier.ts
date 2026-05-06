// Warstwa 3: gdy rules + heurystyki nie wystarczyły — pytamy Claude

import { z } from 'zod';

import { anthropic, OCR_MODEL } from '@/lib/anthropic/client';
import type { ExtractedInvoice } from '@/lib/ocr/schema';

import type { CategorizationResult } from './rule-engine';

const KPIR_COLUMNS_DESCRIPTION = `
Możliwe kolumny KPiR (Książka Przychodów i Rozchodów):
- col_10: Zakup towarów handlowych i materiałów (do dalszej odsprzedaży lub produkcji)
- col_11: Koszty uboczne zakupu (transport, opakowania, ubezpieczenie zakupu)
- col_12: Wynagrodzenia w gotówce i naturze (pensje, umowy zlecenia, dzieło)
- col_13: Pozostałe wydatki (paliwo, telekom, software, marketing, biuro - WIĘKSZOŚĆ wydatków)
- col_15: Koszty badań i rozwoju (B+R - tylko jeśli firma ma status CBR lub kwalifikuje się do ulgi B+R)

Zasada: jeśli niepewny - daj col_13.
`;

const aiClassificationResponseSchema = z.object({
  kpir_column: z.enum(['col_10', 'col_11', 'col_12', 'col_13', 'col_15']),
  category_label: z.string().min(1),
  reasoning: z.string().optional(),
});

export async function classifyByAI(
  data: ExtractedInvoice
): Promise<CategorizationResult | null> {
  try {
    const response = await anthropic.messages.create({
      model: OCR_MODEL,
      max_tokens: 256,
      system:
        'Jesteś księgowym specjalizującym się w polskim KPiR. Klasyfikujesz wydatki firmowe do odpowiednich kolumn KPiR.',
      messages: [
        {
          role: 'user',
          content: `Sklasyfikuj poniższy wydatek do kolumny KPiR.

Sprzedawca: ${data.seller_name}
NIP: ${data.seller_nip ?? 'brak'}
Numer faktury: ${data.document_number}
Pozycje: ${data.line_items?.map((l) => l.name).join(', ') ?? 'brak'}
Kwota brutto: ${data.gross_amount} PLN

${KPIR_COLUMNS_DESCRIPTION}

Zwróć STRICT JSON:
{
  "kpir_column": "col_10 | col_11 | col_12 | col_13 | col_15",
  "category_label": "krótka nazwa kategorii (np. 'Paliwo', 'Marketing', 'Usługi obce')",
  "reasoning": "1 zdanie uzasadnienia"
}

ZWRACAJ TYLKO JSON.`,
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    const jsonText = textBlock.text
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch {
      return null;
    }

    const parsed = aiClassificationResponseSchema.safeParse(parsedJson);
    if (!parsed.success) return null;

    return {
      kpir_column: parsed.data.kpir_column,
      category_label: parsed.data.category_label,
      confidence: 0.7,
      method: 'ai_claude',
    };
  } catch (e) {
    console.error('AI categorization failed:', e);
    return null;
  }
}
