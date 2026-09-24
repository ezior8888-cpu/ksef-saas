/**
 * W-03 — nauka reguł z jednego pytania (krok 20 planu).
 *
 * Drugi raz ten sam sprzedawca: „Adobe drugi raz. Zawsze księgować jako
 * oprogramowanie i już nie pytać?” Jedno „tak” i klient nigdy więcej nie
 * przypisuje kategorii u tego sprzedawcy.
 *
 * TRZY AWARIE, KTÓRE TU ZAMYKAMY:
 *
 * 1. REGUŁA NAUCZONA NA WYJĄTKU. Raz zakup w Media Markt był towarem
 *    handlowym, a potem są to laptopy dla pracowników. Reguła bez widełek
 *    kwotowych księgowałaby wszystko tak samo — cicho, przez wiele miesięcy.
 *    Dlatego reguła zapamiętuje sprzedawcę I zakres kwot, a wydatek poza
 *    zakresem pyta MIMO jej istnienia.
 *
 * 2. „KTO TO ZAKSIĘGOWAŁ?”. Reguła powstała z jednego kliknięcia trzy
 *    miesiące temu i klient dawno o niej zapomniał. Każda pozycja przypisana
 *    regułą niesie znacznik źródła: nazwę reguły, datę powstania i drogę do
 *    jej wyłączenia. Żadna decyzja agenta nie jest anonimowa.
 *
 * 3. ZMIANA STANU FAKTYCZNEGO. Klient zmienia formę opodatkowania albo traci
 *    prawo do odliczenia w danej kategorii. Reguły dotknięte zmianą tracą
 *    ważność, zamiast dalej robić swoje na nieaktualnym założeniu.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { renderCopy } from '@/lib/flo/copy';
import type { FloDbClient } from '@/lib/flo/db-types';
import { isMuted } from '@/lib/flo/decisions';
import { fingerprintOf } from '@/lib/flo/fingerprint';
import { registerFloHandler } from '@/lib/flo/handlers';
import { isKindEnabledForTenant, shouldCompute } from '@/lib/flo/kind-switch';
import { formatPlnPlain } from '@/lib/flo/money';
import { createProposal, type CreateProposalInput } from '@/lib/flo/proposals';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';

// ═══════════════════════════════════════════════════════════════
// Widełki
// ═══════════════════════════════════════════════════════════════

/**
 * O ile w górę i w dół od dotychczasowych kwot reguła obowiązuje bez pytania.
 *
 * Dwa i pół raza to kompromis: normalne wahania rachunku za prąd czy paliwo
 * mieszczą się spokojnie, a zakup innej klasy (laptop zamiast myszki) już nie.
 */
const BOUND_FACTOR = 2.5;

export interface RuleBounds {
  minAmount: number;
  maxAmount: number;
}

/** Widełki z dotychczasowych kwot u tego sprzedawcy. */
export function computeBounds(amounts: readonly number[]): RuleBounds {
  const positive = amounts.filter((a) => Number.isFinite(a) && a > 0);
  if (positive.length === 0) return { minAmount: 0, maxAmount: 0 };

  const min = Math.min(...positive);
  const max = Math.max(...positive);

  return {
    minAmount: Math.max(0, min / BOUND_FACTOR),
    maxAmount: max * BOUND_FACTOR,
  };
}

export interface StoredRule {
  id: string;
  matchValue: string;
  kpirColumn: string;
  categoryLabel: string;
  minAmount: number | null;
  maxAmount: number | null;
  createdAt: string;
}

export type RuleVerdict =
  | { applies: true; rule: StoredRule }
  | { applies: false; reason: 'no_rule' | 'out_of_bounds' };

/**
 * Czy reguła obowiązuje dla tej kwoty — funkcja czysta, sedno awarii nr 1.
 *
 * Reguła bez widełek (wszystkie sprzed migracji 00063) obowiązuje zawsze;
 * nie zmieniamy zachowania rzeczy, które już działają.
 */
export function ruleApplies(
  rule: StoredRule | null,
  grossAmount: number,
): RuleVerdict {
  if (!rule) return { applies: false, reason: 'no_rule' };

  const belowMin = rule.minAmount !== null && grossAmount < rule.minAmount;
  const aboveMax = rule.maxAmount !== null && grossAmount > rule.maxAmount;

  if (belowMin || aboveMax) {
    return { applies: false, reason: 'out_of_bounds' };
  }

  return { applies: true, rule };
}

/**
 * Znacznik źródła do ładunku propozycji i do interfejsu.
 *
 * To jest odpowiedź na pytanie „kto to zaksięgował". Bez daty i bez drogi do
 * wyłączenia znacznik byłby ozdobą, a nie wyjaśnieniem.
 */
export function ruleSourceMarker(rule: StoredRule): {
  label: string;
  ruleId: string;
  createdAt: string;
  href: string;
} {
  return {
    label: `reguła: ${rule.matchValue} → ${rule.categoryLabel}`,
    ruleId: rule.id,
    createdAt: rule.createdAt,
    href: `/settings/flo#reguly-${rule.id}`,
  };
}

// ═══════════════════════════════════════════════════════════════
// Propozycja nauki reguły
// ═══════════════════════════════════════════════════════════════

/** Ile razy sprzedawca musi wystąpić, żeby pytanie o regułę miało sens. */
export const LEARN_AFTER_OCCURRENCES = 2;

export interface BuildRuleProposalInput {
  tenantId: string;
  sellerName: string;
  sellerNip: string | null;
  categoryLabel: string;
  kpirColumn: string;
  /** Kwoty dotychczasowych dokumentów tego sprzedawcy. */
  amounts: readonly number[];
  now?: Date;
}

export function buildRuleProposal(
  input: BuildRuleProposalInput,
): CreateProposalInput | null {
  if (input.amounts.length < LEARN_AFTER_OCCURRENCES) return null;

  const now = input.now ?? new Date();
  const bounds = computeBounds(input.amounts);

  const copy = renderCopy('expense.rule', {
    sprzedawca: input.sellerName,
    kategoria: input.categoryLabel,
  });

  return {
    tenantId: input.tenantId,
    kind: 'expense.rule',
    topicKey: `expense.rule:${input.sellerNip ?? input.sellerName}`,
    title: copy.title,
    body: `${copy.body} Reguła obejmie kwoty od ${formatPlnPlain(bounds.minAmount)} do ${formatPlnPlain(bounds.maxAmount)} — przy większych i tak zapytam.`,
    fingerprint: fingerprintOf({
      seller: input.sellerNip ?? input.sellerName,
      category: input.categoryLabel,
      count: input.amounts.length,
    }),
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    priority: 70,
    payload: {
      sellerName: input.sellerName,
      sellerNip: input.sellerNip,
      categoryLabel: input.categoryLabel,
      kpirColumn: input.kpirColumn,
      minAmount: bounds.minAmount,
      maxAmount: bounds.maxAmount,
      // Wariant `choice` bez własnych etykiet dałby „Tak" i „Nie teraz" —
      // a to pytanie o trwałą decyzję, nie o odłożenie sprawy. Komentarz
      // w `kind-variant.ts` zapowiada dokładnie te dwie odpowiedzi.
      primaryLabel: 'Tak, zawsze tak księguj',
      secondary: [{ label: 'Pytaj za każdym razem', intent: 'dismiss' }],
    },
    evidence: [
      { label: 'Wydatki tego sprzedawcy', href: '/expenses' },
      { label: 'Twoje reguły', href: '/settings/flo#reguly' },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// Producent: pytanie po potwierdzeniu kategorii (plan FLO 2, K1.8)
// ═══════════════════════════════════════════════════════════════

/**
 * KTO I KIEDY PYTA O REGUŁĘ.
 *
 * Nie puls, tylko moment, w którym człowiek WŁAŚNIE potwierdził kategorię
 * u tego sprzedawcy (wykonawca W-01). Reguła nauczona z pytania jest oparta
 * na decyzji człowieka, a nie na zgadywaniu odczytu — i pada w chwili, gdy
 * klient ma tę sprawę w głowie, a nie tydzień później.
 *
 * CZTERY POWODY, DLA KTÓRYCH AGENT MILCZY MIMO DRUGIEGO WYSTĄPIENIA:
 *
 * 1. Koszt bez kategorii (`kpir_column` puste) — nie ma czego utrwalać.
 * 2. Historia niespójna: ten sam sprzedawca był już księgowany inaczej.
 *    Reguła z takiej historii byłaby zgadywaniem, które z dwóch księgowań
 *    jest tym właściwym — a pomyłka szłaby dalej cicho, miesiącami.
 * 3. Reguła dla tego sprzedawcy już istnieje.
 * 4. Bramki agenta (wyłącznik, kanarek, wyciszenie) — sprawdzane PRZED
 *    odczytem kosztów, żeby wyłączona funkcja nie kosztowała zapytań.
 */

const KIND = 'expense.rule' as const;

/** Koszt, który klient właśnie potwierdził. */
export interface ReviewedExpense {
  sellerName: string;
  sellerNip: string | null;
  kpirColumn: string;
  categoryLabel: string;
}

/** Dokument tego samego sprzedawcy — do widełek i do kontroli spójności. */
export interface SellerExpense {
  grossAmount: number;
  kpirColumn: string | null;
}

export interface RuleLearningSources {
  readReviewedExpense: (
    tenantId: string,
    expenseId: string,
  ) => Promise<ReviewedExpense | null>;
  readSellerExpenses: (
    tenantId: string,
    sellerName: string,
  ) => Promise<SellerExpense[]>;
  /** Czy klient ma już regułę dla tego sprzedawcy (po NIP-ie albo nazwie). */
  hasRuleFor: (tenantId: string, matchValues: readonly string[]) => Promise<boolean>;
  /** Globalny wyłącznik — wstrzykiwany tylko w testach. */
  readGlobalKill?: () => Promise<boolean>;
}

export type RuleLearningOutcome =
  | 'created'
  /** Wyłącznik, blokada w kodzie, kanarek albo wyciszenie rodzaju. */
  | 'disabled'
  /** Kosztu nie ma albo nie należy do tego konta. */
  | 'missing'
  | 'no_category'
  /** Mniej niż `LEARN_AFTER_OCCURRENCES` dokumentów tego sprzedawcy. */
  | 'too_few'
  /** Ten sprzedawca bywał księgowany różnie — reguła byłaby zgadywaniem. */
  | 'mixed_history'
  | 'rule_exists';

/**
 * Kwoty sprzedawcy i wyrok o spójności — funkcja czysta.
 *
 * Kwoty biorą się ze WSZYSTKICH dokumentów sprzedawcy, bo widełki mają
 * opisywać to, ile u niego zwykle płacimy. Spójność liczy się tylko
 * z dokumentów, które mają już kolumnę księgi — koszt jeszcze nieprzejrzany
 * niczemu nie przeczy.
 */
export function collectSellerAmounts(
  expenses: readonly SellerExpense[],
  kpirColumn: string,
): { amounts: number[]; mixed: boolean } {
  const amounts = expenses
    .map((e) => e.grossAmount)
    .filter((a) => Number.isFinite(a) && a > 0);

  const mixed = expenses.some(
    (e) => e.kpirColumn !== null && e.kpirColumn !== kpirColumn,
  );

  return { amounts, mixed };
}

export async function proposeRuleAfterReview(
  tenantId: string,
  expenseId: string,
  now: Date,
  db: FloDbClient,
  sources: RuleLearningSources,
): Promise<RuleLearningOutcome> {
  const verdict = await isKindEnabledForTenant(
    KIND,
    tenantId,
    db,
    sources.readGlobalKill,
  );
  if (!shouldCompute(verdict)) return 'disabled';
  if (await isMuted(tenantId, KIND, now, db)) return 'disabled';

  const expense = await sources.readReviewedExpense(tenantId, expenseId);
  if (!expense) return 'missing';
  if (!expense.kpirColumn || !expense.sellerName) return 'no_category';

  const seller = expense.sellerNip?.trim() || expense.sellerName;
  if (await sources.hasRuleFor(tenantId, [seller, expense.sellerName])) {
    return 'rule_exists';
  }

  const history = await sources.readSellerExpenses(tenantId, expense.sellerName);
  const { amounts, mixed } = collectSellerAmounts(history, expense.kpirColumn);

  if (mixed) return 'mixed_history';
  if (amounts.length < LEARN_AFTER_OCCURRENCES) return 'too_few';

  const proposal = buildRuleProposal({
    tenantId,
    sellerName: expense.sellerName,
    sellerNip: expense.sellerNip,
    categoryLabel: expense.categoryLabel,
    kpirColumn: expense.kpirColumn,
    amounts,
    now,
  });
  if (!proposal) return 'too_few';

  const result = await createProposal(proposal, db, sources.readGlobalKill);
  return result.status === 'created' || result.status === 'updated'
    ? 'created'
    : 'disabled';
}

export function productionRuleLearningSources(): RuleLearningSources {
  return {
    readReviewedExpense: async (tenantId, expenseId) => {
      const client: SupabaseClient<Database> = createAdminClient();
      const { data, error } = await client
        .from('expenses')
        .select('seller_name, seller_nip, kpir_column, category_label')
        // Klient administracyjny omija RLS — przynależność do konta
        // sprawdzamy jawnie.
        .eq('tenant_id', tenantId)
        .eq('id', expenseId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data?.seller_name || !data.kpir_column) return null;

      return {
        sellerName: data.seller_name,
        sellerNip: data.seller_nip,
        kpirColumn: data.kpir_column,
        categoryLabel: data.category_label ?? data.kpir_column,
      };
    },

    readSellerExpenses: async (tenantId, sellerName) => {
      const client: SupabaseClient<Database> = createAdminClient();
      const { data, error } = await client
        .from('expenses')
        .select('gross_amount, kpir_column')
        .eq('tenant_id', tenantId)
        .eq('seller_name', sellerName)
        .limit(SELLER_HISTORY_LIMIT);

      if (error) throw new Error(error.message);

      return data.map((row) => ({
        grossAmount: Number(row.gross_amount ?? 0),
        kpirColumn: row.kpir_column,
      }));
    },

    hasRuleFor: async (tenantId, matchValues) => {
      const values = [...new Set(matchValues.filter((v) => v.length > 0))];
      if (values.length === 0) return false;

      const client: SupabaseClient<Database> = createAdminClient();
      const { data, error } = await client
        .from('categorization_rules')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('match_value', values)
        .limit(1);

      if (error) throw new Error(error.message);
      return data.length > 0;
    },
  };
}

/** Ile dokumentów sprzedawcy czytamy do widełek. Wystarczy z nawiązką. */
const SELLER_HISTORY_LIMIT = 200;

// ═══════════════════════════════════════════════════════════════
// Unieważnianie po zmianie profilu podatkowego
// ═══════════════════════════════════════════════════════════════

export interface TaxProfileSnapshot {
  form: string;
  vat: boolean;
}

/**
 * Czy zmiana profilu podatkowego unieważnia reguły.
 *
 * Reguły agenta dotyczą WYŁĄCZNIE kolumny księgi — nigdy stawki VAT ani prawa
 * do odliczenia, bo te biorą się z dokumentu. Ale sama kolumna zależy od
 * formy opodatkowania: ryczałtowiec nie prowadzi księgi przychodów
 * i rozchodów, więc jego reguły przestają cokolwiek znaczyć.
 */
export function invalidatesRules(
  before: TaxProfileSnapshot | null,
  after: TaxProfileSnapshot | null,
): boolean {
  if (!before || !after) return false;
  return before.form !== after.form || before.vat !== after.vat;
}

interface RulesClient {
  from: (table: 'categorization_rules') => {
    delete: () => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message: string } | null;
    }>;
  };
}

/**
 * Kasuje reguły po zmianie profilu.
 *
 * Kasujemy, a nie wyłączamy: reguła oparta na nieaktualnym założeniu jest
 * gorsza od jej braku, bo wygląda na przemyślaną. Klient nauczy agenta
 * od nowa jednym kliknięciem, tak jak za pierwszym razem.
 */
export async function invalidateRulesForTenant(
  tenantId: string,
  client: RulesClient = createAdminClient() as unknown as RulesClient,
): Promise<void> {
  const { error } = await client
    .from('categorization_rules')
    .delete()
    .eq('tenant_id', tenantId);

  if (error) throw new Error(error.message);
}

// ═══════════════════════════════════════════════════════════════
// Wykonawca
// ═══════════════════════════════════════════════════════════════

/**
 * „Tak, zawsze tak księguj” — zapisujemy regułę razem z widełkami.
 *
 * Reguła bez widełek to zgadywanie na podstawie jednego przypadku, więc
 * handler odmawia zapisania takiej, nawet gdyby ładunek jej nie zawierał.
 */
registerFloHandler('expense.rule', async (ctx) => {
  const payload = ctx.proposal.payload ?? {};
  const sellerNip = payload.sellerNip;
  const sellerName = payload.sellerName;
  const kpirColumn = payload.kpirColumn;
  const categoryLabel = payload.categoryLabel;
  const minAmount = payload.minAmount;
  const maxAmount = payload.maxAmount;

  if (
    typeof kpirColumn !== 'string' ||
    typeof categoryLabel !== 'string' ||
    typeof minAmount !== 'number' ||
    typeof maxAmount !== 'number'
  ) {
    throw new Error('Propozycja reguły bez kompletu danych — nie zapisuję');
  }

  const client = createAdminClient() as unknown as RulesClient;
  const { error } = await client.from('categorization_rules').insert({
    tenant_id: ctx.proposal.tenant_id,
    match_type: typeof sellerNip === 'string' && sellerNip ? 'nip' : 'name_exact',
    match_value:
      typeof sellerNip === 'string' && sellerNip
        ? sellerNip
        : String(sellerName ?? ''),
    kpir_column: kpirColumn,
    category_label: categoryLabel,
    min_amount: minAmount,
    max_amount: maxAmount,
  });

  if (error) throw new Error(error.message);

  return {
    summary: `reguła zapisana: ${String(sellerName)} → ${categoryLabel}`,
    details: { minAmount, maxAmount },
  };
});
