// Warstwa 1: dopasowanie po NIP lub keyword (najszybsze, najpewniejsze)

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';

export type KpirColumn = Database['public']['Enums']['kpir_column'];

export type CategorizationMethod =
  | 'rule_nip'
  | 'rule_keyword'
  | 'rule_global_nip'
  | 'rule_global_keyword'
  | 'learned'
  | 'ml_heuristic'
  | 'ai_claude'
  | 'manual';

export interface CategorizationResult {
  kpir_column: KpirColumn;
  category_label: string;
  confidence: number;
  method: CategorizationMethod;
}

function normalizeNip(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? digits : null;
}

/**
 * Próbuj sklasyfikować po NIP. Sprawdza najpierw per-tenant rules (uczone),
 * potem globalną bazę. Zwraca null jeśli żadna reguła nie pasuje.
 */
export async function classifyByNip(
  tenantId: string,
  nip: string
): Promise<CategorizationResult | null> {
  const normalized = normalizeNip(nip);
  if (!normalized) return null;

  const supabase = createAdminClient();

  const { data: tenantRule } = await supabase
    .from('categorization_rules')
    .select('id, hit_count, kpir_column, category_label')
    .eq('tenant_id', tenantId)
    .eq('match_type', 'nip')
    .eq('match_value', normalized)
    .maybeSingle();

  if (tenantRule) {
    await supabase
      .from('categorization_rules')
      .update({
        hit_count: (tenantRule.hit_count ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', tenantRule.id);

    return {
      kpir_column: tenantRule.kpir_column,
      category_label: tenantRule.category_label,
      confidence: 0.98,
      method: 'learned',
    };
  }

  const { data: globalRule } = await supabase
    .from('kpir_global_rules')
    .select('kpir_column, category_label')
    .eq('nip', normalized)
    .maybeSingle();

  if (globalRule) {
    return {
      kpir_column: globalRule.kpir_column,
      category_label: globalRule.category_label,
      confidence: 0.95,
      method: 'rule_global_nip',
    };
  }

  return null;
}

/**
 * Próbuj sklasyfikować po keyword w nazwie sprzedawcy.
 */
export async function classifyByKeyword(
  tenantId: string,
  sellerName: string
): Promise<CategorizationResult | null> {
  if (!sellerName.trim()) return null;

  const supabase = createAdminClient();
  const nameLower = sellerName.toLowerCase();

  const { data: tenantRules } = await supabase
    .from('categorization_rules')
    .select('match_value, kpir_column, category_label')
    .eq('tenant_id', tenantId)
    .eq('match_type', 'keyword');

  if (tenantRules?.length) {
    const sorted = [...tenantRules].sort(
      (a, b) => b.match_value.length - a.match_value.length
    );
    for (const rule of sorted) {
      const needle = rule.match_value.toLowerCase();
      if (needle && nameLower.includes(needle)) {
        return {
          kpir_column: rule.kpir_column,
          category_label: rule.category_label,
          confidence: 0.92,
          method: 'rule_keyword',
        };
      }
    }
  }

  const { data: globalRules } = await supabase
    .from('kpir_global_rules')
    .select('keyword, kpir_column, category_label')
    .not('keyword', 'is', null);

  if (globalRules?.length) {
    const sorted = [...globalRules].sort(
      (a, b) => (b.keyword?.length ?? 0) - (a.keyword?.length ?? 0)
    );
    for (const rule of sorted) {
      const kw = rule.keyword?.toLowerCase();
      if (kw && nameLower.includes(kw)) {
        return {
          kpir_column: rule.kpir_column,
          category_label: rule.category_label,
          confidence: 0.88,
          method: 'rule_global_keyword',
        };
      }
    }
  }

  return null;
}
