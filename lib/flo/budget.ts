/**
 * Bezpiecznik kosztowy agenta (krok 16 planu, mechanizm M10).
 *
 * PO CO: przy cenie 39,99 zł brutto (32,51 zł netto) agent ma kosztować około
 * 0,95 zł na klienta miesięcznie. Marża nie jest zagrożona przez model —
 * jest zagrożona przez BRAK LIMITU. Jedno konto z tysiącem dokumentów albo
 * jedna pętla ponowień potrafi zjeść miesięczny zysk z kilkudziesięciu kont,
 * i zrobi to w dwa dni, zanim ktokolwiek zajrzy do rachunku.
 *
 * ZASADA: po przekroczeniu limitu agent NIE PRZESTAJE DZIAŁAĆ. Przechodzi na
 * szablony z kroku 14 — klient traci elokwencję, nie funkcje. Propozycje
 * powstają dalej, liczby są te same, tylko zdania są sztywne. To jest różnica
 * między „agent zamilkł” a „agent mówi prościej”.
 */

import { floDb, type FloDbClient, type FloUsageRow } from '@/lib/flo/db-types';

// ═══════════════════════════════════════════════════════════════
// Cennik i limity
// ═══════════════════════════════════════════════════════════════

/**
 * Kurs przyjęty do przeliczeń. ZAŁOŻENIE, nie kurs z rynku — limity są
 * z natury przybliżone, a codzienne odpytywanie NBP po to, żeby wiedzieć,
 * czy wolno wywołać model za grosz, byłoby absurdem. Przy większych wahaniach
 * wystarczy poprawić tę stałą.
 */
export const USD_PLN = 3.6;

/** Cel: tyle agent ma kosztować u typowego klienta (≈3% ceny netto). */
export const MONTHLY_TARGET_PLN = 0.95;

/** Twarda granica: 3 zł to ≈9% ceny netto. Powyżej marża zaczyna boleć. */
export const MONTHLY_HARD_LIMIT_PLN = 3.0;

/**
 * Limit dobowy istnieje po to, żeby pętla ponowień nie wypaliła całego
 * miesięcznego budżetu w jedno popołudnie. Celowo nie jest to 1/30 limitu
 * miesięcznego: klient może mieć jeden ciężki dzień (import historii,
 * domknięcie miesiąca) i nie ma powodu go za to karać.
 */
export const DAILY_HARD_LIMIT_PLN = 0.6;

export type FloModel = 'claude-haiku-4-5' | 'claude-sonnet-5';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokeny odczytane z pamięci podręcznej promptu — dziesiąta część ceny. */
  cacheReadTokens?: number;
  /** Tokeny zapisane do pamięci podręcznej — narzut 25%. */
  cacheWriteTokens?: number;
}

/** Dolary za milion tokenów. Stan cennika na sierpień 2026. */
const PRICE_PER_MTOK: Record<FloModel, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
};

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export function estimateCostUsd(model: FloModel, usage: TokenUsage): number {
  const price = PRICE_PER_MTOK[model];
  const perToken = (tokens: number, rate: number) => (tokens / 1_000_000) * rate;

  return (
    perToken(usage.inputTokens, price.input) +
    perToken(usage.outputTokens, price.output) +
    perToken(usage.cacheReadTokens ?? 0, price.input * CACHE_READ_MULTIPLIER) +
    perToken(usage.cacheWriteTokens ?? 0, price.input * CACHE_WRITE_MULTIPLIER)
  );
}

export function usdToPln(usd: number): number {
  return usd * USD_PLN;
}

// ═══════════════════════════════════════════════════════════════
// Werdykt (funkcja czysta — sedno reguły)
// ═══════════════════════════════════════════════════════════════

export interface BudgetSpend {
  todayUsd: number;
  monthUsd: number;
}

export type BudgetVerdict =
  | { allowed: true; alert: boolean; spentPln: number }
  | { allowed: false; reason: 'daily' | 'monthly'; spentPln: number };

export function evaluateBudget(spend: BudgetSpend): BudgetVerdict {
  const monthPln = usdToPln(spend.monthUsd);
  const todayPln = usdToPln(spend.todayUsd);

  if (monthPln >= MONTHLY_HARD_LIMIT_PLN) {
    return { allowed: false, reason: 'monthly', spentPln: monthPln };
  }
  if (todayPln >= DAILY_HARD_LIMIT_PLN) {
    return { allowed: false, reason: 'daily', spentPln: todayPln };
  }

  // Alarm zapala się PRZED twardym limitem. Konto, które przejadło dwukrotność
  // celu, jeszcze działa — ale operator ma się na nie spojrzeć, zanim uderzy
  // w ścianę. Wtedy jeszcze da się poprawić regułę; po fakcie zostaje tylko
  // tłumaczenie się z rachunku.
  return {
    allowed: true,
    alert: monthPln >= MONTHLY_TARGET_PLN * 2,
    spentPln: monthPln,
  };
}

// ═══════════════════════════════════════════════════════════════
// Odczyt i zapis zużycia
// ═══════════════════════════════════════════════════════════════

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthStart(date: Date): string {
  return `${date.toISOString().slice(0, 7)}-01`;
}

export async function readSpend(
  tenantId: string,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<BudgetSpend> {
  const { data, error } = await db
    .from('flo_usage')
    .select('day, cost_usd')
    .eq('tenant_id', tenantId)
    .gte('day', monthStart(now));

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Pick<FloUsageRow, 'day' | 'cost_usd'>[];
  const today = dayKey(now);

  return {
    monthUsd: rows.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0),
    todayUsd: rows
      .filter((r) => r.day === today)
      .reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0),
  };
}

/**
 * Czy wolno teraz wywołać model. Wołane PRZED wywołaniem, nie po —
 * po fakcie limit jest tylko statystyką.
 */
export async function assertBudget(
  tenantId: string,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<BudgetVerdict> {
  return evaluateBudget(await readSpend(tenantId, now, db));
}

export async function recordUsage(
  tenantId: string,
  model: FloModel,
  usage: TokenUsage,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<number> {
  const cost = estimateCostUsd(model, usage);
  const day = dayKey(now);

  const existing = await db
    .from('flo_usage')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('day', day)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);
  const current = existing.data as FloUsageRow | null;

  const { error } = await db.from('flo_usage').upsert(
    {
      tenant_id: tenantId,
      day,
      input_tokens: (current?.input_tokens ?? 0) + usage.inputTokens,
      output_tokens: (current?.output_tokens ?? 0) + usage.outputTokens,
      cost_usd: Number(current?.cost_usd ?? 0) + cost,
      calls: (current?.calls ?? 0) + 1,
    },
    { onConflict: 'tenant_id,day' },
  );

  if (error) throw new Error(error.message);
  return cost;
}
