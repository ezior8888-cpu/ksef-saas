/**
 * Zadanie porównujące trybu cichego (plan FLO 2, K3.2) — druga połowa pętli.
 *
 * `recordShadow` zapisuje, co agent BY pokazał. Tutaj, po tygodniu, sprawdzamy,
 * co klient zrobił naprawdę, i dopisujemy wynik przez `settleShadow`. Bez tego
 * trafność liczy się z zera i bramka gotowości nie zapali się nigdy.
 *
 * DWIE ZASADY, OD KTÓRYCH ZALEŻY WARTOŚĆ LICZBY:
 *
 * 1. Rozstrzygamy tylko to, co widać NIEZALEŻNIE od karty. Rodzaj, którego
 *    jedyną drogą do wyniku jest sama karta (K-01: jedyny zapis wpłaty w kodzie
 *    to wykonawca K-01; K-02: jedyna wysyłka przypomnień to wykonawca K-02),
 *    w trybie cichym nie ma prawdy o rzeczywistości — każda sprawa wyszłaby na
 *    „chybienie” i bramka stałaby na czerwono z definicji. Te rodzaje czekają
 *    na trafność z decyzji w kanarku (`NO_INDEPENDENT_SIGNAL`).
 *
 * 2. Brak decyzji człowieka ≠ chybienie. Koszt, którego nikt jeszcze nie
 *    przejrzał, zostaje nierozstrzygnięty — liczony jako „czeka”, nie jako błąd
 *    agenta.
 *
 * Źródła danych biznesowych są wstrzykiwane (`SettleSources`): klient agenta
 * (`FloDbClient`) celowo nie widzi faktur ani kosztów.
 */
import * as Sentry from '@sentry/nextjs';

import type { SupabaseClient } from '@supabase/supabase-js';

import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import { settleShadow, type ActualOutcome, type ShadowProposal } from '@/lib/flo/shadow';
import type { JobLogger } from '@/lib/jobs/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';
import type { FloProposalKind } from '@/types/flo';

/** Plan: rozstrzygamy wpisy starsze niż tydzień — klient ma czas zareagować. */
export const SETTLE_AFTER_DAYS = 7;
const PAGE = 500;
const DAY_MS = 86_400_000;

export interface ShadowRow {
  id: string;
  tenant_id: string;
  kind: string;
  proposal: ShadowProposal;
}

/** Stan kosztu, jaki widzi człowiek — do rozstrzygnięcia W-01. */
export interface ExpenseReviewState {
  kpirColumn: string | null;
  isReviewed: boolean;
}

export interface SettleSources {
  readExpense: (tenantId: string, expenseId: string) => Promise<ExpenseReviewState | null>;
}

/** Zwraca wynik albo `null`, gdy rzeczywistość jeszcze nie jest znana. */
export type ShadowResolver = (
  row: ShadowRow,
  sources: SettleSources,
) => Promise<ActualOutcome | null>;

/**
 * W-01 — trafienie: człowiek PRZEJRZAŁ koszt i zostawił tę samą kolumnę KPiR,
 * którą agent by zaproponował. Przejrzany z inną kolumną = chybienie.
 * Nieprzejrzany, usunięty albo wpis sprzed zapisu przewidywania = nie wiadomo.
 */
export const resolveExpenseReview: ShadowResolver = async (row, sources) => {
  const expected = row.proposal.expected?.kpirColumn;
  const expenseId = row.proposal.entityId;
  if (typeof expected !== 'string' || !expenseId) return null;

  const expense = await sources.readExpense(row.tenant_id, expenseId);
  if (!expense || !expense.isReviewed) return null;

  return { didIt: expense.kpirColumn === expected, entityId: expenseId };
};

export const SHADOW_RESOLVERS: Partial<Record<FloProposalKind, ShadowResolver>> = {
  'expense.review': resolveExpenseReview,
};

/** Rodzaje, których w trybie cichym nie da się rozstrzygnąć — z powodem. */
export const NO_INDEPENDENT_SIGNAL: Partial<Record<FloProposalKind, string>> = {
  'payment.confirm':
    'jedyny zapis wpłaty w kodzie to wykonawca K-01 — bez karty wpłata nie powstanie',
  'payment.chase':
    'jedyna wysyłka przypomnień to wykonawca K-02 — bez karty przypomnienie nie wyjdzie',
};

export interface ShadowSettleResult {
  /** Wpisy z dopisanym wynikiem w tym przebiegu. */
  settled: number;
  matched: number;
  /** Rodzaj ma definicję, ale rzeczywistość jeszcze nieznana. */
  stillOpen: number;
  /** Rodzaj bez definicji trafienia (w tym `NO_INDEPENDENT_SIGNAL`). */
  noDefinition: number;
  failed: number;
}

export async function runShadowSettle(
  options: {
    now?: Date;
    db?: FloDbClient;
    sources?: SettleSources;
    logger?: Pick<JobLogger, 'info' | 'error'>;
  } = {},
): Promise<ShadowSettleResult> {
  const now = options.now ?? new Date();
  const db = options.db ?? floDb();
  const sources = options.sources ?? productionSettleSources();
  const cutoff = new Date(now.getTime() - SETTLE_AFTER_DAYS * DAY_MS).toISOString();
  const result: ShadowSettleResult = { settled: 0, matched: 0, stillOpen: 0, noDefinition: 0, failed: 0 };

  // Stronicowanie po id, nie po przesunięciu: rozstrzygnięte wiersze wypadają
  // z filtra `matched IS NULL`, więc `range(from, …)` przeskakiwałby resztę.
  let afterId: string | null = null;
  for (;;) {
    let query = db
      .from('flo_shadow')
      .select('id, tenant_id, kind, proposal')
      .is('matched', null)
      .lt('created_at', cutoff);
    if (afterId) query = query.gt('id', afterId);
    const { data, error } = await query.order('id').limit(PAGE);
    if (error) throw new Error(`flo_shadow: ${error.message}`);

    const rows: ShadowRow[] = (data ?? []).map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      kind: row.kind,
      // Kolumna JSONB: kształt nadaje `recordShadow`; brakujące pola resolver
      // i tak traktuje jako „nie wiadomo”.
      proposal: row.proposal as unknown as ShadowProposal,
    }));
    for (const row of rows) {
      const resolver = SHADOW_RESOLVERS[row.kind as FloProposalKind];
      if (!resolver) {
        result.noDefinition += 1;
        continue;
      }
      try {
        const actual = await resolver(row, sources);
        if (!actual) {
          result.stillOpen += 1;
          continue;
        }
        const hit = await settleShadow({ shadowId: row.id, actual, proposal: row.proposal }, db);
        result.settled += 1;
        if (hit) result.matched += 1;
      } catch (e) {
        // Jeden wpis nie zatrzymuje reszty — ten sam wzór co w pulsie.
        result.failed += 1;
        Sentry.captureException(e, {
          tags: { job: 'flo-shadow-settle', kind: row.kind, tenant_id: row.tenant_id },
        });
        options.logger?.error('[flo.shadow-settle] wpis nierozstrzygnięty z błędem', {
          shadowId: row.id,
          kind: row.kind,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (rows.length < PAGE) break;
    const lastId = rows[rows.length - 1]!.id;
    // Bezpiecznik: strona, która nie przesuwa odczytu, zapętliłaby przebieg
    // i zajęła worker na zawsze (wpisy „czeka” nie wypadają z filtra).
    if (lastId === afterId) throw new Error('flo_shadow: stronicowanie nie posuwa się naprzód');
    afterId = lastId;
  }

  options.logger?.info('[flo.shadow-settle] przebieg', { ...result });
  return result;
}

export function productionSettleSources(): SettleSources {
  const client = createAdminClient() as unknown as SupabaseClient<Database>;
  return {
    async readExpense(tenantId, expenseId) {
      const { data, error } = await client
        .from('expenses')
        .select('kpir_column, is_reviewed')
        .eq('id', expenseId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw new Error(`expenses: ${error.message}`);
      if (!data) return null;
      return { kpirColumn: data.kpir_column ?? null, isReviewed: Boolean(data.is_reviewed) };
    },
  };
}
