/**
 * Wdrożenie kanarkowe funkcji agenta (krok 55 planu).
 *
 * Funkcje o promieniu rażenia 4 — dokument w rejestrze państwowym albo
 * wiadomość u obcej osoby — nie wychodzą na wszystkich naraz. Idą przez
 * 10% kont, potem 50%, potem 100%, z tygodniem na każdym etapie.
 *
 * REGUŁA, KTÓRA DECYDUJE O SENSIE CAŁEGO MECHANIZMU: **JEDNA REKLAMACJA
 * ZATRZYMUJE ROZWIJANIE.** Nie „kilka”, nie „istotny odsetek”. Przy
 * promieniu 4 pojedyncze zgłoszenie oznacza jeden dokument w rejestrze
 * państwowym albo jedną wiadomość, której nie da się cofnąć — a rozwinięcie
 * z 10% na 50% zaraz po nim znaczy, że pięć razy tyle ludzi dostanie tę samą
 * awarię, zanim zdążymy ją zrozumieć.
 *
 * Zatrzymanie NIE COFA etapu. Cofnięcie jest decyzją człowieka, bo bywa,
 * że zgłoszenie dotyczy czegoś, co i tak trzeba naprawić niezależnie
 * od zasięgu — a odsłonięcie i schowanie funkcji tego samego dnia jest
 * dla klienta gorsze niż jedno i drugie osobno.
 *
 * FUNKCJE PROMIENIA 3 NIE WCHODZĄ DO KANARKA W OGÓLE, dopóki nie zapali się
 * zielone światło prawnika. Kanarek mierzy trafność; przy grupie podatkowej
 * problemem nie jest trafność, tylko prawo do wypowiadania się.
 */

import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import { KIND_RADIUS } from '@/lib/flo/shadow';
import { TAX_TOPIC_APPROVED } from '@/lib/flo/tax-topic';
import type { FloProposalKind } from '@/types/flo';

const DAY_MS = 86_400_000;

/** Etapy odsłaniania. */
export const ROLLOUT_STAGES = [0, 10, 50, 100] as const;
export type RolloutStage = (typeof ROLLOUT_STAGES)[number];

/** Ile dni musi minąć na etapie, zanim wolno rozwinąć dalej. */
export const STAGE_MIN_DAYS = 7;

/**
 * Kolejność odsłaniania z planu.
 *
 * Nie jest przypadkowa: zaczynamy od funkcji, których pomyłka zostaje
 * WEWNĄTRZ konta (kategoryzacja kosztu), a kończymy na tych, które wysyłają
 * dokumenty do rejestru państwowego. Gdy coś pójdzie nie tak na początku
 * listy, kosztuje to jedno kliknięcie „cofnij”; na końcu — korektę.
 */
export const ROLLOUT_ORDER: readonly {
  feature: string;
  kind: FloProposalKind;
}[] = [
  { feature: 'W-01', kind: 'expense.review' },
  { feature: 'W-02', kind: 'expense.rule' },
  { feature: 'K-01', kind: 'payment.confirm' },
  { feature: 'X-01', kind: 'ksef.status' },
  { feature: 'X-02', kind: 'ksef.fix' },
  { feature: 'B-01', kind: 'accountant.package' },
  { feature: 'K-02', kind: 'payment.chase' },
  { feature: 'P-01', kind: 'invoice.draft' },
  { feature: 'P-02', kind: 'invoice.batch' },
];

// ═══════════════════════════════════════════════════════════════
// Przydział konta do kanarka
// ═══════════════════════════════════════════════════════════════

/**
 * Deterministyczny kubełek 0–99 dla pary (rodzaj, konto).
 *
 * DWIE WŁASNOŚCI, KTÓRE MUSZĄ BYĆ PRAWDZIWE:
 *
 * 1. STABILNOŚĆ. To samo konto dostaje ten sam kubełek przy każdym
 *    wywołaniu, także po restarcie i po wdrożeniu. Konto, które wpada
 *    i wypada z kanarka, dostaje funkcję znikającą bez powodu — a to jest
 *    gorsze niż jej brak.
 *
 * 2. RÓŻNY PODZIAŁ DLA KAŻDEJ FUNKCJI. Rodzaj wchodzi do skrótu, więc te
 *    same 10% kont nie jest królikiem doświadczalnym przy każdej kolejnej
 *    funkcji. Bez tego garstka klientów dostawałaby wszystkie surowe
 *    funkcje produktu, jedna po drugiej.
 */
export function bucketOf(kind: string, tenantId: string): number {
  const input = `${kind}:${tenantId}`;

  // FNV-1a, 32-bitowy. Wybrany, bo jest krótki, deterministyczny i nie
  // wymaga zależności — nie chodzi tu o kryptografię, tylko o równomierny
  // podział, którego wynik nie zmienia się między wersjami Node'a.
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash % 100;
}

// ═══════════════════════════════════════════════════════════════
// Stan wdrożenia
// ═══════════════════════════════════════════════════════════════

export interface RolloutState {
  kind: string;
  stage: RolloutStage;
  /** ISO; `null` przy etapie 0. */
  stageSince: string | null;
  complaints: number;
  halted: boolean;
  haltReason: string | null;
}

/** Konto poza kanarkiem po prostu nie widzi funkcji. */
export function isInCanary(state: RolloutState | null, tenantId: string): boolean {
  if (!state) return false;
  if (state.stage === 0) return false;
  if (state.stage === 100) return true;

  return bucketOf(state.kind, tenantId) < state.stage;
}

// ═══════════════════════════════════════════════════════════════
// Rozwijanie
// ═══════════════════════════════════════════════════════════════

export type AdvanceBlocker =
  | 'halted_by_complaint'
  | 'stage_too_young'
  | 'already_full'
  | 'needs_lawyer'
  | 'not_started';

export type AdvanceVerdict =
  | { can: true; from: RolloutStage; to: RolloutStage }
  | { can: false; reason: AdvanceBlocker; detail: string };

/**
 * Czy wolno rozwinąć funkcję na kolejny etap — funkcja czysta.
 *
 * Kolejność sprawdzeń jest tu treścią: NAJPIERW zgłoszenia, potem czas.
 * Odwrotna kolejność dawałaby komunikat „poczekaj jeszcze dwa dni”
 * w sytuacji, w której czekanie nic nie zmieni, bo funkcja i tak jest
 * wstrzymana.
 */
export function canAdvance(
  state: RolloutState | null,
  kind: FloProposalKind,
  now: Date,
): AdvanceVerdict {
  // Promień 3 nie wchodzi do kanarka bez zielonego światła prawnika.
  // Kanarek mierzy trafność, a tam problemem nie jest trafność.
  if (KIND_RADIUS[kind] === 3 && !TAX_TOPIC_APPROVED) {
    return {
      can: false,
      reason: 'needs_lawyer',
      detail: 'Promień 3 czeka na zielone światło prawnika — kanarek tego nie zastąpi.',
    };
  }

  if (!state) {
    return {
      can: false,
      reason: 'not_started',
      detail: 'Funkcja nie została jeszcze odsłonięta — zacznij od etapu 10%.',
    };
  }

  if (state.halted || state.complaints > 0) {
    return {
      can: false,
      reason: 'halted_by_complaint',
      detail:
        state.haltReason ??
        `${state.complaints} zgłoszenie zatrzymuje rozwijanie. Napraw i wyzeruj licznik świadomie.`,
    };
  }

  if (state.stage === 100) {
    return { can: false, reason: 'already_full', detail: 'Funkcja jest u wszystkich.' };
  }

  const since = state.stageSince ? Date.parse(state.stageSince) : NaN;
  const days = Number.isNaN(since)
    ? 0
    : Math.floor((now.getTime() - since) / DAY_MS);

  if (days < STAGE_MIN_DAYS) {
    return {
      can: false,
      reason: 'stage_too_young',
      detail: `Etap ${state.stage}% trwa ${days} z ${STAGE_MIN_DAYS} dni.`,
    };
  }

  return { can: true, from: state.stage, to: nextStage(state.stage) };
}

export function nextStage(stage: RolloutStage): RolloutStage {
  const index = ROLLOUT_STAGES.indexOf(stage);
  return ROLLOUT_STAGES[Math.min(index + 1, ROLLOUT_STAGES.length - 1)]!;
}

// ═══════════════════════════════════════════════════════════════
// Odczyt i zapis
// ═══════════════════════════════════════════════════════════════

interface RolloutRow {
  kind: string;
  stage: number;
  stage_since: string | null;
  complaints: number;
  halted: boolean;
  halt_reason: string | null;
}

function toState(row: RolloutRow): RolloutState {
  return {
    kind: row.kind,
    stage: (ROLLOUT_STAGES as readonly number[]).includes(row.stage)
      ? (row.stage as RolloutStage)
      : 0,
    stageSince: row.stage_since,
    complaints: row.complaints,
    halted: row.halted,
    haltReason: row.halt_reason,
  };
}

export async function readRollout(
  kind: FloProposalKind,
  db: FloDbClient = floDb(),
): Promise<RolloutState | null> {
  const { data, error } = await db
    .from('flo_rollout')
    .select('kind, stage, stage_since, complaints, halted, halt_reason')
    .eq('kind', kind)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toState(data as unknown as RolloutRow) : null;
}

export async function setStage(
  input: { kind: FloProposalKind; stage: RolloutStage },
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<void> {
  const { error } = await db.from('flo_rollout').upsert(
    {
      kind: input.kind,
      stage: input.stage,
      stage_since: input.stage === 0 ? null : now.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: 'kind' },
  );

  if (error) throw new Error(error.message);
}

/**
 * Zgłoszenie klienta przypisane do funkcji.
 *
 * Zwiększa licznik I ustawia `halted`. Dwie rzeczy naraz, bo licznik sam
 * z siebie niczego nie blokuje, a flaga bez licznika gubi informację o tym,
 * ile razy to się zdarzyło.
 */
export async function recordComplaint(
  input: { kind: FloProposalKind; reason: string; currentComplaints: number },
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<void> {
  const { error } = await db
    .from('flo_rollout')
    .update({
      complaints: input.currentComplaints + 1,
      halted: true,
      halt_reason: input.reason,
      updated_at: now.toISOString(),
    })
    .eq('kind', input.kind);

  if (error) throw new Error(error.message);
}
