/**
 * W-04 — producent w pulsie (plan FLO 2, K1.9).
 *
 * Funkcje czyste („co miesiąc ten sam hosting, w tym miesiącu dokumentu nie
 * ma") istniały od kroku 21, ale nikt ich nie wołał. Ten plik jest tym kimś.
 *
 * Osobno od `expense-missing.ts`, bo tamten moduł jest czysty i ma pilnować
 * zasady językowej: mówimy o DOKUMENCIE, nigdy o kwocie do dopisania. Tutaj
 * mieszka wyłącznie odczyt i decyzja, kiedy pytać.
 *
 * CZTERY ZASADY:
 *
 * 1. NIE PRZED DZIESIĄTYM. Faktura za hosting potrafi przyjść piątego;
 *    pytanie pierwszego dnia miesiąca to nagabywanie o coś, co jest w drodze.
 *    Warunek jest PIERWSZY, przed bramkami — przez dziewięć dni miesiąca puls
 *    nie kosztuje nawet odczytu flag.
 *
 * 2. JEDNA KARTA NA MIESIĄC. Klucz tematu to `expense.missing:RRRR-MM`, więc
 *    kolejne przebiegi aktualizują tę samą kartę zamiast stawiać nowe.
 *
 * 3. KARTA ZNIKA, GDY DOKUMENT SIĘ ZNAJDZIE. Klient wgrywa fakturę, cykl jest
 *    kompletny — otwarte pytanie zamykamy przy najbliższym przebiegu.
 *    Pytanie o coś, co system już widzi, traktuje klienta jak niekompetentnego.
 *
 * 4. KONTO WYŁĄCZONE NIE KOSZTUJE ODCZYTU KOSZTÓW. Bramki przed zapytaniem;
 *    `createProposal` sprawdza je jeszcze raz przed zapisem.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

import { floDb, type FloDbClient, type FloProposalRow } from '@/lib/flo/db-types';
import { isMuted } from '@/lib/flo/decisions';
import {
  buildMissingDocsProposal,
  detectRecurringCycles,
  findMissingThisMonth,
  type ExpenseRecord,
} from '@/lib/flo/functions/expense-missing';
import { isKindEnabledForTenant } from '@/lib/flo/kind-switch';
import { createProposal } from '@/lib/flo/proposals';
import type { JobLogger } from '@/lib/jobs/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';

const KIND = 'expense.missing' as const;

/** Od którego dnia miesiąca wolno pytać o brakujący dokument. */
export const ASK_FROM_DAY = 10;

/**
 * Ile miesięcy wstecz czytamy, żeby rozpoznać rytm.
 *
 * Cykl wymaga trzech różnych miesięcy, a roczne okno pokazuje też przerwy:
 * abonament sprzed pół roku, z którego klient zrezygnował, nie ma już rytmu
 * w ostatnich miesiącach i sam wypada z wykrywania.
 */
export const HISTORY_MONTHS = 12;

/** Górny limit odczytu kosztów jednego konta. */
const EXPENSE_LIMIT = 500;

export interface ExpenseMissingSources {
  /** Koszty konta z ostatnich `HISTORY_MONTHS` miesięcy. */
  readRecentExpenses: (tenantId: string, now: Date) => Promise<ExpenseRecord[]>;
  /** Globalny wyłącznik — wstrzykiwany tylko w testach. */
  readGlobalKill?: () => Promise<boolean>;
}

export function productionExpenseMissingSources(): ExpenseMissingSources {
  return { readRecentExpenses };
}

async function readRecentExpenses(
  tenantId: string,
  now: Date,
): Promise<ExpenseRecord[]> {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - HISTORY_MONTHS);

  const client: SupabaseClient<Database> = createAdminClient();
  const { data, error } = await client
    .from('expenses')
    .select('id, seller_name, gross_amount, issue_date')
    .eq('tenant_id', tenantId)
    .gte('issue_date', since.toISOString().slice(0, 10))
    .order('issue_date', { ascending: false })
    .limit(EXPENSE_LIMIT);

  if (error) throw new Error(error.message);

  return data.map((row) => ({
    id: row.id,
    sellerName: row.seller_name,
    grossAmount: Number(row.gross_amount ?? 0),
    issueDate: row.issue_date,
  }));
}

// ═══════════════════════════════════════════════════════════════
// Jedno konto
// ═══════════════════════════════════════════════════════════════

export type MissingDocsOutcome =
  /** Przed dziesiątym dniem miesiąca — nie pytamy i nic nie czytamy. */
  | 'too_early'
  /** Wyłącznik, blokada, kanarek albo wyciszenie. */
  | 'disabled'
  | 'created'
  /** Karta z tego miesiąca zaktualizowana w miejscu. */
  | 'refreshed'
  /** Dokumenty się znalazły — otwarte pytanie zamknięte. */
  | 'closed'
  | 'nothing';

export interface MissingDocsResult {
  outcome: MissingDocsOutcome;
  /** Ile otwartych kart zamknięto, bo dokumenty się znalazły. */
  closed: number;
}

export async function produceMissingDocs(
  tenantId: string,
  now: Date,
  db: FloDbClient,
  sources: ExpenseMissingSources,
): Promise<MissingDocsResult> {
  if (now.getUTCDate() < ASK_FROM_DAY) {
    return { outcome: 'too_early', closed: 0 };
  }

  const verdict = await isKindEnabledForTenant(
    KIND,
    tenantId,
    db,
    sources.readGlobalKill,
  );
  if (!verdict.enabled) return { outcome: 'disabled', closed: 0 };
  if (await isMuted(tenantId, KIND, now, db)) {
    return { outcome: 'disabled', closed: 0 };
  }

  const month = now.toISOString().slice(0, 7);
  const expenses = await sources.readRecentExpenses(tenantId, now);
  const missing = findMissingThisMonth(
    detectRecurringCycles(expenses),
    now,
    ASK_FROM_DAY,
  );

  const live = await readLiveCard(tenantId, month, db);

  if (missing.length === 0) {
    // Dokument się znalazł (albo cykl się skończył). Otwarte pytanie o coś,
    // co system już widzi, jest gorsze niż brak pytania.
    if (live?.status === 'open' && (await closeFound(live.id, db))) {
      return { outcome: 'closed', closed: 1 };
    }
    return { outcome: 'nothing', closed: 0 };
  }

  const proposal = buildMissingDocsProposal({ tenantId, missing, month, now });
  if (!proposal) return { outcome: 'nothing', closed: 0 };

  const result = await createProposal(
    // Termin ważności ustala karta przy pierwszym przebiegu. Odświeżanie go
    // co dzień sprawiłoby, że przemilczane pytanie nie wygaśnie nigdy.
    live ? { ...proposal, expiresAt: new Date(live.expires_at) } : proposal,
    db,
    sources.readGlobalKill,
  );

  switch (result.status) {
    case 'created':
      return { outcome: 'created', closed: 0 };
    case 'updated':
      return { outcome: 'refreshed', closed: 0 };
    default:
      return { outcome: 'disabled', closed: 0 };
  }
}

type LiveCard = Pick<FloProposalRow, 'id' | 'status' | 'expires_at'>;

async function readLiveCard(
  tenantId: string,
  month: string,
  db: FloDbClient,
): Promise<LiveCard | null> {
  const { data, error } = await db
    .from('flo_proposals')
    .select('id, status, expires_at')
    .eq('tenant_id', tenantId)
    .eq('topic_key', `${KIND}:${month}`)
    .in('status', ['open', 'approved'])
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as LiveCard | null) ?? null;
}

/**
 * Zamyka pytanie, na które odpowiedział świat, a nie człowiek.
 *
 * Powód `stale` — dane zmieniły się po pokazaniu karty. Warunek
 * `status = 'open'` chroni przed wyścigiem z klientem, który klika w tej
 * samej sekundzie.
 */
async function closeFound(id: string, db: FloDbClient): Promise<boolean> {
  const { data, error } = await db
    .from('flo_proposals')
    .update({ status: 'expired', dismissed_reason: 'stale' })
    .eq('id', id)
    .eq('status', 'open')
    .select('id');

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

// ═══════════════════════════════════════════════════════════════
// Wszystkie konta
// ═══════════════════════════════════════════════════════════════

export interface MissingDocsSweepResult {
  asked: number;
  closed: number;
  /** Konta, na których reguła padła. Puls poszedł dalej. */
  failed: number;
}

export async function runMissingDocsSweep(
  tenantIds: readonly string[],
  now: Date = new Date(),
  db: FloDbClient = floDb(),
  sources: ExpenseMissingSources = productionExpenseMissingSources(),
  logger?: Pick<JobLogger, 'error'>,
): Promise<MissingDocsSweepResult> {
  const result: MissingDocsSweepResult = { asked: 0, closed: 0, failed: 0 };

  // Przed dziesiątym dniem miesiąca nie ma po co wchodzić w pętlę po kontach.
  if (now.getUTCDate() < ASK_FROM_DAY) return result;

  for (const tenantId of tenantIds) {
    try {
      const { outcome, closed } = await produceMissingDocs(
        tenantId,
        now,
        db,
        sources,
      );
      if (outcome === 'created') result.asked++;
      result.closed += closed;
    } catch (e) {
      result.failed++;
      Sentry.captureException(e, {
        tags: { job: 'flo-tick', kind: KIND, tenant_id: tenantId },
      });
      const message = e instanceof Error ? e.message : 'nieznany błąd';
      (logger ?? console).error(
        `[flo.tick] ${KIND} padło na koncie ${tenantId}: ${message}`,
      );
    }
  }

  return result;
}
