// Warstwa 1b: reguła nauczona po nazwie sprzedawcy (`name_exact`)

import { createAdminClient } from '@/lib/supabase/admin';

import type { CategorizationResult } from './rule-engine';

/** Nazwa sprzedawcy do porównań: bez wielkości liter i nadmiarowych spacji. */
function normalizeSellerName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl-PL');
}

/**
 * Reguła nauczona po nazwie sprzedawcy (`name_exact`) — zapisuje ją poprawka
 * kategorii wydatku bez NIP (`learnFromCorrection`), np. paragonu. Do
 * 02.10.2026 nikt jej nie czytał, choć użytkownik słyszał „apka się
 * nauczyła” (F-084). Porównanie po znormalizowanej nazwie (reguły zapisane
 * wcześniej mają surową nazwę), widełki kwot jak przy regule NIP.
 */
export async function classifyByExactName(
  tenantId: string,
  sellerName: string,
  grossAmount?: number,
): Promise<CategorizationResult | null> {
  const wanted = normalizeSellerName(sellerName);
  if (!wanted) return null;

  const supabase = createAdminClient();
  const { data: rules } = await supabase
    .from('categorization_rules')
    .select('id, match_value, hit_count, kpir_column, category_label, min_amount, max_amount')
    .eq('tenant_id', tenantId)
    .eq('match_type', 'name_exact');

  const rule = (rules ?? []).find((r) => normalizeSellerName(r.match_value) === wanted);
  if (!rule) return null;
  if (grossAmount !== undefined) {
    if (rule.min_amount != null && grossAmount < Number(rule.min_amount)) return null;
    if (rule.max_amount != null && grossAmount > Number(rule.max_amount)) return null;
  }

  await supabase
    .from('categorization_rules')
    .update({
      hit_count: (rule.hit_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', rule.id);

  return {
    kpir_column: rule.kpir_column,
    category_label: rule.category_label,
    confidence: 0.96,
    method: 'learned',
  };
}
