/**
 * P-03 — producent w pulsie: „brak faktury w tym miesiącu" (plan FLO 2, K1.10).
 *
 * Funkcje czyste (`detectRhythm`, `shouldAskAboutMissing`,
 * `buildMissingInvoiceProposal`) istniały od kroków 31–33 i nie miały
 * wywołania. Ten plik je spina.
 *
 * TYLKO PYTANIE, ŻADNEGO SZKICU. P-03 kończy się pytaniem „wystawiłeś ją
 * gdzie indziej?", a nie gotową fakturą — szkice to P-01/P-02 i osobna
 * decyzja. Kartę buduje funkcja czysta, która o szkicu nie wie nic.
 *
 * PAMIĘĆ PROFILU BEZ TABELI. Plan zakładał zapisany profil rytmu (stan,
 * historia pytań). Takiej tabeli nie ma i nie tworzymy jej migracją —
 * wszystko, czego potrzeba, już gdzieś jest:
 *
 * | Czego trzeba | Skąd |
 * |---|---|
 * | rytm (odstęp, typowy dzień, kwota) | `detectRhythm` z faktur ostatniego roku |
 * | „czy pytanie już padło" | istnienie karty o tym kluczu tematu — w DOWOLNYM stanie |
 * | „wystawiam gdzie indziej" | licznik odrzuceń sprawy w pamięci decyzji |
 * | „profil uśpiony" | `missedCycles` — po dwóch pominiętych cyklach milkniemy |
 *
 * Ostatni wiersz jest tu najważniejszy: agent, który co miesiąc przypomina
 * o straconym kliencie, jest okrutny bez powodu.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { unlimitedCap, type DailyCap } from '@/lib/flo/daily-cap';
import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import { isMuted, readDecisionRows } from '@/lib/flo/decisions';
import { buildMissingInvoiceProposal } from '@/lib/flo/functions/invoice-batch';
import { isKindEnabledForTenant } from '@/lib/flo/kind-switch';
import { createProposal } from '@/lib/flo/proposals';
import {
  detectRhythm,
  DORMANT_AFTER_MISSED,
  missedCycles,
  type InvoiceForRhythm,
} from '@/lib/flo/rhythm';
import { runSweep, type FloSweepResult } from '@/lib/flo/sweep';
import type { JobLogger } from '@/lib/jobs/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';

const KIND = 'invoice.draft' as const;

/** Ile miesięcy historii wystarcza, żeby zobaczyć rytm i jego koniec. */
export const HISTORY_MONTHS = 12;

/** Górny limit odczytu faktur jednego konta. */
const INVOICE_LIMIT = 500;

// ═══════════════════════════════════════════════════════════════
// Dane
// ═══════════════════════════════════════════════════════════════

/** Faktura jednego kontrahenta — wejście do wykrywania rytmu. */
export interface IssuedInvoice extends InvoiceForRhythm {
  /** NIP nabywcy albo jego nazwa — tożsamość profilu. */
  contractorKey: string;
  contractorName: string;
}

export interface InvoiceMissingSources {
  readIssuedInvoices: (tenantId: string, now: Date) => Promise<IssuedInvoice[]>;
  /** Globalny wyłącznik — wstrzykiwany tylko w testach. */
  readGlobalKill?: () => Promise<boolean>;
}

export function productionInvoiceMissingSources(): InvoiceMissingSources {
  return { readIssuedInvoices };
}

/**
 * Nazwy pozycji z `fa3_data` — funkcja czysta.
 *
 * Bez nich `detectRhythm` nie odróżni „opieki nad serwerem" od „projektu
 * logo" u tej samej firmy i zrobi z dwóch różnych zleceń jeden rytm.
 * Kształt `{ lines: [{ name }] }` ten sam, co czyta eksport JPK.
 */
export function itemNamesFromFa3(fa3: unknown): string[] {
  if (!fa3 || typeof fa3 !== 'object' || Array.isArray(fa3)) return [];
  const lines = (fa3 as Record<string, unknown>).lines;
  if (!Array.isArray(lines)) return [];

  return lines.flatMap((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) return [];
    const name = (line as Record<string, unknown>).name;
    return typeof name === 'string' && name.trim().length > 0 ? [name] : [];
  });
}

async function readIssuedInvoices(
  tenantId: string,
  now: Date,
): Promise<IssuedInvoice[]> {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - HISTORY_MONTHS);

  const client: SupabaseClient<Database> = createAdminClient();
  const { data, error } = await client
    .from('invoices')
    .select('id, issue_date, gross_total, buyer_nip, buyer_data, fa3_data')
    .eq('tenant_id', tenantId)
    .eq('direction', 'issued')
    .gte('issue_date', since.toISOString().slice(0, 10))
    .order('issue_date', { ascending: false })
    .limit(INVOICE_LIMIT);

  if (error) throw new Error(error.message);

  return data.flatMap((row) => {
    const name = buyerNameOf(row.buyer_data);
    const key = row.buyer_nip?.trim() || name;
    if (!key) return [];

    return [
      {
        id: row.id,
        issueDate: row.issue_date,
        grossTotal: Number(row.gross_total ?? 0),
        itemNames: itemNamesFromFa3(row.fa3_data),
        contractorKey: key,
        contractorName: name || key,
      },
    ];
  });
}

function buyerNameOf(buyerData: unknown): string {
  if (!buyerData || typeof buyerData !== 'object' || Array.isArray(buyerData)) {
    return '';
  }
  const record = buyerData as Record<string, unknown>;
  const name = record.name ?? record.nazwa ?? record.buyer_name;
  return typeof name === 'string' ? name.trim() : '';
}

// ═══════════════════════════════════════════════════════════════
// Reguła — funkcje czyste
// ═══════════════════════════════════════════════════════════════

/** Faktury pogrupowane po kontrahencie. */
export function groupByContractor(
  invoices: readonly IssuedInvoice[],
): Map<string, IssuedInvoice[]> {
  const byContractor = new Map<string, IssuedInvoice[]>();
  for (const invoice of invoices) {
    const list = byContractor.get(invoice.contractorKey) ?? [];
    list.push(invoice);
    byContractor.set(invoice.contractorKey, list);
  }
  return byContractor;
}

/**
 * Ile dni minęło od spodziewanej faktury — funkcja czysta.
 *
 * Spodziewana = ostatnia plus typowy odstęp. Liczymy od NIEJ, a nie od dnia
 * miesiąca z profilu: przy rytmie dwutygodniowym „typowy dzień miesiąca"
 * nie znaczy nic.
 */
export function daysAfterExpected(
  lastInvoiceDate: string,
  medianIntervalDays: number,
  now: Date,
): number {
  const last = Date.parse(lastInvoiceDate);
  if (Number.isNaN(last) || medianIntervalDays <= 0) return 0;
  const expected = last + medianIntervalDays * 86_400_000;
  return Math.floor((now.getTime() - expected) / 86_400_000);
}

// ═══════════════════════════════════════════════════════════════
// Jedno konto
// ═══════════════════════════════════════════════════════════════

export type MissingInvoiceOutcome =
  | 'created'
  /** Wyłącznik, blokada, kanarek albo wyciszenie rodzaju. */
  | 'disabled'
  /** Żaden kontrahent nie ma rytmu albo nikt nie zalega z fakturą. */
  | 'nothing';

export async function produceMissingInvoice(
  tenantId: string,
  now: Date,
  db: FloDbClient,
  sources: InvoiceMissingSources,
  /** Dzienny limit nowych kart na konto — patrz `daily-cap.ts`. */
  cap: DailyCap = unlimitedCap(),
): Promise<MissingInvoiceOutcome> {
  const verdict = await isKindEnabledForTenant(
    KIND,
    tenantId,
    db,
    sources.readGlobalKill,
  );
  if (!verdict.enabled) return 'disabled';
  if (await isMuted(tenantId, KIND, now, db)) return 'disabled';

  const invoices = await sources.readIssuedInvoices(tenantId, now);
  if (invoices.length === 0) return 'nothing';

  const asked = await readAskedTopics(tenantId, db);
  const decisions = await readDecisionRows(tenantId, db);

  for (const [key, history] of groupByContractor(invoices)) {
    const rhythm = detectRhythm(history);
    if (rhythm.kind !== 'profile') continue;

    const profile = { ...rhythm.profile, contractorKey: key, state: 'confirmed' as const };

    // Uśpienie jest CICHE: po dwóch pominiętych cyklach przestajemy pytać,
    // zamiast co miesiąc przypominać o straconym kliencie.
    if (missedCycles(profile, now) >= DORMANT_AFTER_MISSED) continue;

    const days = daysAfterExpected(
      profile.lastInvoiceDate,
      profile.medianIntervalDays,
      now,
    );

    const topicKey = `${KIND}:missing:${key}`;
    const proposal = buildMissingInvoiceProposal({
      tenantId,
      missing: {
        profileId: key,
        contractorName: history[0]!.contractorName,
        typicalDayOfMonth: profile.typicalDayOfMonth,
        typicalAmount: profile.typicalAmount,
        // Pytanie o koniec współpracy pada RAZ W ŻYCIU PROFILU — dowodem
        // jest karta o tym kluczu, w dowolnym stanie, także zamknięta.
        endedAskedBefore: asked.has(topicKey),
        // „Wystawiona poza FaktFlow" to odrzucenie sprawy; dwa z rzędu
        // znaczą „fakturuję ich gdzie indziej", a nie zbieg okoliczności.
        elsewhereStreak:
          decisions.find((row) => row.kind === topicKey)?.dismissed ?? 0,
      },
      daysAfterTypical: days,
      now,
    });

    if (!proposal) continue;

    // Każda karta P-03 jest nowa (klucz per kontrahent), więc limit
    // sprawdzamy tuż przed zapisem.
    if (!cap.canAsk(tenantId)) return 'nothing';

    const result = await createProposal(proposal, db, sources.readGlobalKill);
    if (result.status === 'created') {
      cap.spend(tenantId);
      return 'created';
    }
  }

  return 'nothing';
}

/** Klucze tematów, o które ten klient już był pytany — w dowolnym stanie. */
async function readAskedTopics(
  tenantId: string,
  db: FloDbClient,
): Promise<Set<string>> {
  const { data, error } = await db
    .from('flo_proposals')
    .select('topic_key')
    .eq('tenant_id', tenantId)
    .eq('kind', KIND);

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.topic_key));
}

// ═══════════════════════════════════════════════════════════════
// Wszystkie konta
// ═══════════════════════════════════════════════════════════════


export async function runMissingInvoiceSweep(
  tenantIds: readonly string[],
  now: Date = new Date(),
  db: FloDbClient = floDb(),
  sources: InvoiceMissingSources = productionInvoiceMissingSources(),
  logger?: Pick<JobLogger, 'error'>,
  cap: DailyCap = unlimitedCap(),
): Promise<FloSweepResult> {
  return runSweep(
    KIND,
    tenantIds,
    async (tenantId) => {
      const outcome = await produceMissingInvoice(tenantId, now, db, sources, cap);
      // P-03 niczego nie zamyka: pytanie „wystawiłeś ją gdzie indziej?"
      // rozstrzyga człowiek, nie kolejny przebieg pulsu.
      return { asked: outcome === 'created' ? 1 : 0 };
    },
    logger,
  );
}
