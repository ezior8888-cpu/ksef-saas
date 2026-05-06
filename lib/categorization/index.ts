// Główny orkiestrator — kaskadowo woła 3 warstwy

import { z } from 'zod';

import type { ExtractedInvoice } from '@/lib/ocr/schema';
import { createAdminClient } from '@/lib/supabase/admin';

import { classifyByAI } from './ai-classifier';
import { classifyByHeuristics } from './heuristics';
import {
  classifyByKeyword,
  classifyByNip,
  type CategorizationResult,
  type KpirColumn,
} from './rule-engine';

const kpirColumnSchema = z.enum([
  'col_7',
  'col_8',
  'col_10',
  'col_11',
  'col_12',
  'col_13',
  'col_15',
  'col_16',
]);

function parseKpirColumn(raw: string): KpirColumn | null {
  const r = kpirColumnSchema.safeParse(raw);
  return r.success ? r.data : null;
}

function normalizeNipDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? digits : null;
}

export async function categorizeExpense(
  tenantId: string,
  data: ExtractedInvoice
): Promise<CategorizationResult> {
  if (data.seller_nip) {
    const nipResult = await classifyByNip(tenantId, data.seller_nip);
    if (nipResult) return nipResult;
  }

  const keywordResult = await classifyByKeyword(tenantId, data.seller_name);
  if (keywordResult) return keywordResult;

  const heuristicResult = classifyByHeuristics(data);
  if (heuristicResult) return heuristicResult;

  const aiResult = await classifyByAI(data);
  if (aiResult) return aiResult;

  return {
    kpir_column: 'col_13',
    category_label: 'Pozostałe wydatki',
    confidence: 0.3,
    method: 'manual',
  };
}

/**
 * Zapisz nową regułę, gdy użytkownik ręcznie poprawił kategorię (uczenie preferencji).
 */
export async function learnFromCorrection(
  tenantId: string,
  expense: {
    seller_nip: string | null;
    seller_name: string;
    kpir_column: string;
    category_label: string;
  }
): Promise<void> {
  const kpir = parseKpirColumn(expense.kpir_column);
  if (!kpir) {
    throw new Error(`Nieprawidłowa kolumna KPiR: ${expense.kpir_column}`);
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const normalizedNip = expense.seller_nip
    ? normalizeNipDigits(expense.seller_nip)
    : null;

  if (normalizedNip) {
    const { error } = await supabase.from('categorization_rules').upsert(
      {
        tenant_id: tenantId,
        match_type: 'nip',
        match_value: normalizedNip,
        kpir_column: kpir,
        category_label: expense.category_label,
        hit_count: 1,
        last_used_at: now,
      },
      { onConflict: 'tenant_id,match_type,match_value' }
    );
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('categorization_rules').upsert(
    {
      tenant_id: tenantId,
      match_type: 'name_exact',
      match_value: expense.seller_name,
      kpir_column: kpir,
      category_label: expense.category_label,
      hit_count: 1,
      last_used_at: now,
    },
    { onConflict: 'tenant_id,match_type,match_value' }
  );
  if (error) throw new Error(error.message);
}

export type { CategorizationResult, KpirColumn } from './rule-engine';
