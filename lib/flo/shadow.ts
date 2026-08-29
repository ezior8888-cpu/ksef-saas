/**
 * M7 — tryb cichy i metryki trafności (krok 52 planu).
 *
 * PO CO: nowa funkcja przez pierwsze tygodnie produkuje propozycje
 * NIEWIDOCZNE dla klienta. Zapisujemy, co agent by pokazał, a osobne zadanie
 * dopisuje potem, co klient zrobił naprawdę. Dopiero po przekroczeniu progu
 * trafności funkcja wychodzi z ukrycia.
 *
 * DLACZEGO TO JEST WAŻNIEJSZE, NIŻ WYGLĄDA: bez trybu cichego jedynym
 * sposobem sprawdzenia, czy funkcja trafia, jest wypuszczenie jej na
 * klientów. Przy promieniu rażenia 4 — czyli przy dokumencie w rejestrze
 * państwowym albo wiadomości u obcej osoby — to nie jest test, tylko
 * eksperyment na ludziach.
 *
 * ZAPIS JEST OPERATORSKI. Klient nie widzi tabeli `flo_shadow` (brak polityki
 * SELECT), a do porównania trafiają WYŁĄCZNIE klucze i kwoty — nigdy treść
 * karty ani dane kontrahenta.
 */

import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import { FLO_PROPOSAL_KINDS, type FloProposalKind } from '@/types/flo';

// ═══════════════════════════════════════════════════════════════
// Promień rażenia i progi z części II.8 planu
// ═══════════════════════════════════════════════════════════════

export type Radius = 1 | 2 | 3 | 4;

export interface RadiusThreshold {
  /** Wymagana trafność w procentach. */
  accuracy: number;
  /** Ile propozycji musi się złożyć na wynik. */
  minSample: number;
  /** Czy pojedynczy błąd blokuje wydanie (złoty zbiór). */
  oneErrorBlocks: boolean;
}

export const RADIUS_THRESHOLDS: Record<Radius, RadiusThreshold> = {
  4: { accuracy: 95, minSample: 200, oneErrorBlocks: false },
  // Promień 3 to pieniądze i urząd: złoty zbiór musi przejść w całości.
  3: { accuracy: 100, minSample: 1, oneErrorBlocks: true },
  2: { accuracy: 90, minSample: 300, oneErrorBlocks: false },
  1: { accuracy: 75, minSample: 100, oneErrorBlocks: false },
};

/**
 * Promień rażenia per rodzaj propozycji.
 *
 * Gdy jeden rodzaj obsługuje kilka funkcji o różnym promieniu, wpisujemy
 * WYŻSZY. `invoice.draft` niesie P-03 (promień 1) i pojedynczy szkic z P-02
 * (promień 4) — a przy sporze wygrywa surowszy próg, bo pomyłka w drugą
 * stronę oznacza wypuszczenie funkcji, której skuteczności nie znamy.
 */
export const KIND_RADIUS: Record<FloProposalKind, Radius> = {
  'invoice.draft': 4,
  'invoice.batch': 4,
  'invoice.final': 2,
  'invoice.raise': 4,
  'contractor.check': 2,
  'contractor.foreign': 3,
  'payment.confirm': 2,
  'payment.chase': 4,
  'payment.score': 1,
  'payment.interest': 3,
  'expense.review': 2,
  'expense.rule': 2,
  'expense.missing': 2,
  'ksef.status': 4,
  'ksef.fix': 4,
  'ksef.cert': 1,
  'ksef.outage': 1,
  'ksef.audit': 2,
  'tax.deadline': 3,
  'tax.limit': 3,
  'tax.relief': 3,
  'tax.simulate': 3,
  'tax.setaside': 3,
  'accountant.package': 4,
  'accountant.format': 1,
  'accountant.delivery': 1,
  'onboarding.step': 1,
  'import.done': 2,
  'feature.hint': 1,
  'chat.draft': 2,
  'wrapped.ready': 1,
  'milestone.money': 1,
};

// ═══════════════════════════════════════════════════════════════
// Zapis w trybie cichym
// ═══════════════════════════════════════════════════════════════

/**
 * Co zapisujemy zamiast karty.
 *
 * Świadomie WĄSKI kształt: klucz tematu, odcisk danych i kwota, jeżeli
 * propozycja jakąś niosła. Treść karty i dane kontrahenta nie mają czego
 * szukać w tabeli operatorskiej, którą oglądamy my, a nie klient.
 */
export interface ShadowProposal {
  topicKey: string;
  fingerprint: string;
  /** Kwota, o którą chodziło; do porównania z tym, co klient zrobił. */
  amount?: number | null;
  /** Identyfikator encji, której dotyczyła propozycja (faktura, kontrahent). */
  entityId?: string | null;
}

export async function recordShadow(
  input: { tenantId: string; kind: FloProposalKind; proposal: ShadowProposal },
  db: FloDbClient = floDb(),
): Promise<void> {
  const { error } = await db.from('flo_shadow').insert({
    tenant_id: input.tenantId,
    kind: input.kind,
    proposal: { ...input.proposal },
  });

  if (error) throw new Error(error.message);
}

// ═══════════════════════════════════════════════════════════════
// Porównanie z rzeczywistością
// ═══════════════════════════════════════════════════════════════

/** Co klient zrobił naprawdę. */
export interface ActualOutcome {
  /** Czy zrobił to, co agent by zaproponował. */
  didIt: boolean;
  /** Kwota, na jaką to zrobił. */
  amount?: number | null;
  entityId?: string | null;
}

/** Tolerancja kwotowa przy porównaniu — grosze nie decydują o trafności. */
export const AMOUNT_TOLERANCE = 0.01;

/**
 * Czy propozycja trafiła — funkcja czysta.
 *
 * TRAFIENIE TO NIE JEST „klient coś zrobił”. To jest „klient zrobił TO SAMO,
 * na TĘ SAMĄ kwotę i na TEJ SAMEJ encji”. Luźniejsza definicja dawałaby
 * trafność bliską stu procent u każdej funkcji i nie mówiłaby nic.
 */
export function matchesActual(
  proposal: ShadowProposal,
  actual: ActualOutcome,
): boolean {
  if (!actual.didIt) return false;

  if (proposal.entityId != null && actual.entityId != null) {
    if (proposal.entityId !== actual.entityId) return false;
  }

  if (proposal.amount != null && actual.amount != null) {
    if (Math.abs(proposal.amount - actual.amount) > AMOUNT_TOLERANCE) return false;
  }

  return true;
}

/** Dopisanie wyniku do wpisu z trybu cichego. Wołane przez zadanie porównujące. */
export async function settleShadow(
  input: { shadowId: string; actual: ActualOutcome; proposal: ShadowProposal },
  db: FloDbClient = floDb(),
): Promise<boolean> {
  const matched = matchesActual(input.proposal, input.actual);

  const { error } = await db
    .from('flo_shadow')
    .update({ actual: { ...input.actual }, matched })
    .eq('id', input.shadowId);

  if (error) throw new Error(error.message);
  return matched;
}

// ═══════════════════════════════════════════════════════════════
// Trafność
// ═══════════════════════════════════════════════════════════════

export interface AccuracyStats {
  kind: FloProposalKind;
  radius: Radius;
  /** Ile wpisów ma już rozstrzygnięcie. */
  settled: number;
  matched: number;
  /** Trafność w procentach; `null` przy zerowej próbce. */
  accuracy: number | null;
  /** Ile wpisów wciąż czeka na porównanie. */
  pending: number;
}

export type ReadinessVerdict =
  | { ready: true }
  | {
      ready: false;
      reason: 'sample_too_small' | 'below_threshold' | 'golden_set_failed';
      detail: string;
    };

/**
 * Czy funkcja może wyjść z ukrycia — funkcja czysta.
 *
 * Przy promieniu 3 JEDEN BŁĄD BLOKUJE WYDANIE. To nie jest przesada:
 * w tej grupie klient podejmuje decyzję finansową na podstawie naszej liczby,
 * a „99% poprawnych kwot podatku” znaczy, że co setny człowiek dostanie złą.
 */
export function isReadyToReveal(stats: AccuracyStats): ReadinessVerdict {
  const threshold = RADIUS_THRESHOLDS[stats.radius];

  if (threshold.oneErrorBlocks && stats.settled > stats.matched) {
    return {
      ready: false,
      reason: 'golden_set_failed',
      detail: `${stats.settled - stats.matched} niezgodności przy promieniu ${stats.radius} — jeden błąd blokuje wydanie.`,
    };
  }

  if (stats.settled < threshold.minSample) {
    return {
      ready: false,
      reason: 'sample_too_small',
      detail: `${stats.settled} z ${threshold.minSample} wymaganych propozycji.`,
    };
  }

  if ((stats.accuracy ?? 0) < threshold.accuracy) {
    return {
      ready: false,
      reason: 'below_threshold',
      detail: `${stats.accuracy}% przy wymaganych ${threshold.accuracy}%.`,
    };
  }

  return { ready: true };
}

/** Zlicza trafność per rodzaj z surowych wpisów — funkcja czysta. */
export function summarizeShadow(
  rows: readonly { kind: string; matched: boolean | null }[],
): AccuracyStats[] {
  const byKind = new Map<string, { settled: number; matched: number; pending: number }>();

  for (const row of rows) {
    const bucket = byKind.get(row.kind) ?? { settled: 0, matched: 0, pending: 0 };
    if (row.matched === null) bucket.pending++;
    else {
      bucket.settled++;
      if (row.matched) bucket.matched++;
    }
    byKind.set(row.kind, bucket);
  }

  return FLO_PROPOSAL_KINDS.filter((kind) => byKind.has(kind)).map((kind) => {
    const bucket = byKind.get(kind)!;
    return {
      kind,
      radius: KIND_RADIUS[kind],
      settled: bucket.settled,
      matched: bucket.matched,
      accuracy:
        bucket.settled === 0
          ? null
          : Math.round((bucket.matched / bucket.settled) * 100),
      pending: bucket.pending,
    };
  });
}

export async function accuracyByKind(
  db: FloDbClient = floDb(),
): Promise<AccuracyStats[]> {
  const { data, error } = await db.from('flo_shadow').select('kind, matched');
  if (error) throw new Error(error.message);

  return summarizeShadow(
    (data ?? []).map((row) => ({ kind: row.kind, matched: row.matched })),
  );
}
