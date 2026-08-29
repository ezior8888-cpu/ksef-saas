/**
 * P-04 — przypominajka o podniesieniu stawki (krok 43 planu).
 * ⚠️ PROMIEŃ RAŻENIA 4: wiadomość wychodzi do OBCEJ OSOBY.
 *
 * Stawka, której nikt nie ruszył od dwóch lat, to najcichsza strata w całej
 * jednoosobowej działalności — nie boli w żadnym miesiącu z osobna i nie
 * pojawia się w żadnym zestawieniu. Agent jest jedyną rzeczą, która widzi
 * ten upływ czasu.
 *
 * TRZY AWARIE:
 *
 * 1. PODWYŻKA POLICZONA OD SUMY FAKTURY. Faktura urosła, bo klient sprzedał
 *    więcej godzin, a nie dlatego, że podniósł stawkę. Agent liczący od sumy
 *    zobaczyłby wzrost, którego nie było, i zamilkłby na kolejny rok — albo
 *    odwrotnie, zaproponowałby podwyżkę zaraz po podwyżce. Obrona: liczymy
 *    PER POZYCJA o powtarzalnej nazwie i jednostce, nigdy od sumy.
 *    Przy niejednorodnych pozycjach funkcja MILCZY.
 *
 * 2. WYSYŁKA JEDNYM KLIKNIĘCIEM. Wiadomość o podwyżce cen, która wychodzi
 *    do cudzej skrzynki bez przeczytania, jest najgorszym możliwym skutkiem
 *    tej funkcji: psuje relację, której agent nie zna. Obrona: KARTA NIE MA
 *    PRZYCISKU „WYŚLIJ”. Ma „Pokaż treść”. Wysyłka jest możliwa dopiero
 *    z widoku treści, po wybraniu tonu i ewentualnej edycji.
 *
 * 3. PODWYŻKA W NAJGORSZYM MOMENCIE. Kontrahent ma niezapłaconą fakturę po
 *    terminie, dostał ponaglenie w ostatnim kwartale albo korektę w ostatnim
 *    miesiącu. Pytanie o wyższą stawkę akurat wtedy kończy współpracę.
 *    Obrona: trzy blokady sprawdzane przy budowaniu karty I PONOWNIE
 *    przy kliknięciu.
 *
 * CZEGO TA FUNKCJA NIE ROBI: nie ustala ceny. Agent pokazuje, ile czasu
 * minęło i ile daje rocznie każde 10% — a wysokość stawki jest decyzją
 * biznesową człowieka, nie wynikiem wzoru.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import { formatPln } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import { roundToCents } from '@/lib/xml/invoice-calculator';

const DAY_MS = 86_400_000;

/** Po ilu miesiącach bez zmiany ceny agent się odzywa. */
export const RAISE_AFTER_MONTHS = 12;

/** Ile razy pozycja musi się powtórzyć, żeby uznać ją za stałą. */
export const MIN_OCCURRENCES = 3;

/** Blokada po ponagleniu. */
export const CHASE_BLOCK_DAYS = 90;

/** Blokada po korekcie. */
export const CORRECTION_BLOCK_DAYS = 30;

/** Krok, w jakim pokazujemy skutek roczny. */
export const IMPACT_STEP_PCT = 10;

// ═══════════════════════════════════════════════════════════════
// Historia pozycji
// ═══════════════════════════════════════════════════════════════

export interface HistoryLine {
  name: string;
  unit: string;
  unitPriceNet: number;
  quantity: number;
  /** ISO YYYY-MM-DD */
  issueDate: string;
}

export interface RepeatableLine {
  name: string;
  unit: string;
  /** Aktualna stawka — z najnowszego wystąpienia. */
  currentRate: number;
  /** Kiedy stawka ostatnio się zmieniła; przy stałej cenie: pierwsze wystąpienie. */
  lastChangedOn: string;
  /** Ile jednostek w ostatnich dwunastu miesiącach. */
  annualQuantity: number;
  occurrences: number;
}

/** Nazwy różniące się wielkością liter i spacjami to ta sama pozycja. */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Pozycja, na której da się oprzeć rozmowę o stawce — funkcja czysta.
 *
 * Wymagamy powtarzalności nazwy I jednostki. „Usługa programistyczna / godz.”
 * i „Usługa programistyczna / szt.” to dwie różne rzeczy: przy pierwszej
 * stawka jest ceną czasu, przy drugiej ceną efektu, a porównywanie ich
 * dawałoby liczby bez sensu.
 *
 * Zwraca `null`, gdy żadna pozycja nie powtarza się dość często — czyli
 * przy niejednorodnych fakturach agent MILCZY.
 */
export function findRepeatableLine(
  lines: readonly HistoryLine[],
  today: Date,
): RepeatableLine | null {
  const groups = new Map<string, HistoryLine[]>();

  for (const line of lines) {
    const key = `${normalize(line.name)}|${normalize(line.unit)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  }

  let best: RepeatableLine | null = null;

  for (const bucket of groups.values()) {
    if (bucket.length < MIN_OCCURRENCES) continue;

    const sorted = [...bucket].sort((a, b) => a.issueDate.localeCompare(b.issueDate));
    const latest = sorted[sorted.length - 1]!;
    const yearAgo = today.getTime() - 365 * DAY_MS;

    const annualQuantity = sorted
      .filter((line) => Date.parse(`${line.issueDate}T00:00:00.000Z`) >= yearAgo)
      .reduce((sum, line) => sum + line.quantity, 0);

    const candidate: RepeatableLine = {
      name: latest.name,
      unit: latest.unit,
      currentRate: latest.unitPriceNet,
      lastChangedOn: lastRateChange(sorted),
      annualQuantity,
      occurrences: sorted.length,
    };

    // Przy kilku stałych pozycjach bierzemy tę o największym udziale
    // w przychodzie — rozmowa o stawce dotyczy tej, która waży.
    if (!best || weight(candidate) > weight(best)) best = candidate;
  }

  return best;
}

function weight(line: RepeatableLine): number {
  return line.currentRate * line.annualQuantity;
}

/**
 * Kiedy stawka ostatnio się zmieniła.
 *
 * Przy cenie niezmienionej od zawsze zwracamy datę PIERWSZEGO wystąpienia:
 * tyle czasu klient pracuje za te same pieniądze.
 */
function lastRateChange(sorted: readonly HistoryLine[]): string {
  const latestRate = sorted[sorted.length - 1]!.unitPriceNet;

  for (let index = sorted.length - 1; index > 0; index--) {
    if (sorted[index - 1]!.unitPriceNet !== latestRate) {
      return sorted[index]!.issueDate;
    }
  }

  return sorted[0]!.issueDate;
}

export function monthsSince(isoDate: string, today: Date): number {
  const then = new Date(`${isoDate}T00:00:00.000Z`);
  return (
    (today.getUTCFullYear() - then.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - then.getUTCMonth())
  );
}

// ═══════════════════════════════════════════════════════════════
// Trzy blokady
// ═══════════════════════════════════════════════════════════════

export interface RelationshipState {
  /** Kontrahent ma niezapłaconą fakturę po terminie. */
  hasOverdueInvoice: boolean;
  /** Kiedy ostatnio poszło do niego ponaglenie (K-02); ISO. */
  lastChaseAt: string | null;
  /** Kiedy ostatnio dostał korektę; ISO. */
  lastCorrectionAt: string | null;
}

export type RaiseBlocker =
  | 'overdue_invoice'
  | 'recent_chase'
  | 'recent_correction';

/**
 * Kiedy o podwyżce nie rozmawiamy — funkcja czysta.
 *
 * Wszystkie trzy powody mają wspólny mianownik: kontrahent jest właśnie
 * w sporze albo w kłopocie z tym klientem. Prośba o wyższą stawkę w takim
 * momencie nie jest negocjacją, tylko dolewaniem oliwy.
 */
export function raiseBlockers(
  state: RelationshipState,
  today: Date,
): RaiseBlocker[] {
  const blockers: RaiseBlocker[] = [];

  if (state.hasOverdueInvoice) blockers.push('overdue_invoice');
  if (withinDays(state.lastChaseAt, today, CHASE_BLOCK_DAYS)) {
    blockers.push('recent_chase');
  }
  if (withinDays(state.lastCorrectionAt, today, CORRECTION_BLOCK_DAYS)) {
    blockers.push('recent_correction');
  }

  return blockers;
}

function withinDays(isoDate: string | null, today: Date, days: number): boolean {
  if (!isoDate) return false;
  const then = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(then)) return false;
  return today.getTime() - then <= days * DAY_MS;
}

// ═══════════════════════════════════════════════════════════════
// Decyzja
// ═══════════════════════════════════════════════════════════════

export type RaiseVerdict =
  | {
      kind: 'silent';
      reason: 'no_repeatable_line' | 'too_soon' | 'blocked' | 'no_volume';
      blockers?: RaiseBlocker[];
    }
  | { kind: 'suggest'; line: RepeatableLine; monthsUnchanged: number };

export interface RaiseDecisionInput {
  lines: readonly HistoryLine[];
  relationship: RelationshipState;
  today: Date;
}

export function decideRateRaise(input: RaiseDecisionInput): RaiseVerdict {
  const line = findRepeatableLine(input.lines, input.today);
  // Niejednorodne pozycje: nie ma czego porównywać i nie ma o czym mówić.
  if (!line) return { kind: 'silent', reason: 'no_repeatable_line' };

  const monthsUnchanged = monthsSince(line.lastChangedOn, input.today);
  if (monthsUnchanged < RAISE_AFTER_MONTHS) {
    return { kind: 'silent', reason: 'too_soon' };
  }

  // Współpraca wygasła: pozycja jest w historii, ale nie w ostatnim roku.
  // Rozmowa o stawce z kimś, komu od roku nie wystawiono faktury, to
  // rozmowa o niczym.
  if (line.annualQuantity <= 0) return { kind: 'silent', reason: 'no_volume' };

  const blockers = raiseBlockers(input.relationship, input.today);
  if (blockers.length > 0) return { kind: 'silent', reason: 'blocked', blockers };

  return { kind: 'suggest', line, monthsUnchanged };
}

/** Ile daje rocznie podwyżka o zadany procent. */
export function impactOfRaise(line: RepeatableLine, pct: number): number {
  return roundToCents(line.currentRate * line.annualQuantity * (pct / 100));
}

// ═══════════════════════════════════════════════════════════════
// Treść wiadomości
// ═══════════════════════════════════════════════════════════════

export type RaiseTone = 'rzeczowy' | 'cieply' | 'krotki';

export const RAISE_TONES: readonly RaiseTone[] = ['rzeczowy', 'cieply', 'krotki'];

/**
 * Trzy warianty tonu — do WYBORU CZŁOWIEKA, nie do zgadnięcia przez agenta.
 *
 * Ton wiadomości o pieniądzach zależy od relacji, której agent nie zna:
 * ten sam tekst bywa uprzejmy wobec korporacji i oschły wobec kogoś,
 * z kim klient pracuje od pięciu lat.
 */
export function buildRaiseMessage(input: {
  contractorName: string;
  line: RepeatableLine;
  newRate: number;
  effectiveFrom: string;
  tone: RaiseTone;
}): string {
  const { line, newRate } = input;
  const from = formatFullDate(input.effectiveFrom);
  const oldRate = `${formatPln(line.currentRate)}/${line.unit}`;
  const raised = `${formatPln(newRate)}/${line.unit}`;

  switch (input.tone) {
    case 'rzeczowy':
      return [
        `Dzień dobry,`,
        ``,
        `od ${from} stawka za „${line.name}” wyniesie ${raised} netto zamiast ${oldRate}.`,
        `Obecna stawka obowiązuje bez zmian od ${formatFullDate(line.lastChangedOn)}.`,
        ``,
        `Faktury wystawione do tego dnia rozliczam po dotychczasowej cenie.`,
      ].join('\n');

    case 'cieply':
      return [
        `Dzień dobry,`,
        ``,
        `dobrze nam się współpracuje i chciałbym, żeby tak zostało — dlatego`,
        `uprzedzam z wyprzedzeniem: od ${from} stawka za „${line.name}”`,
        `wyniesie ${raised} netto zamiast ${oldRate}. Ta cena nie zmieniała się`,
        `od ${formatFullDate(line.lastChangedOn)}.`,
        ``,
        `Jeśli chcecie o tym porozmawiać, jestem do dyspozycji.`,
      ].join('\n');

    case 'krotki':
      return [
        `Dzień dobry,`,
        ``,
        `od ${from} stawka za „${line.name}”: ${raised} netto (było ${oldRate}).`,
      ].join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════
// Propozycja
// ═══════════════════════════════════════════════════════════════

export function buildRateRaiseProposal(input: {
  tenantId: string;
  contractorId: string;
  contractorName: string;
  decision: RaiseDecisionInput;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? input.decision.today;
  const verdict = decideRateRaise(input.decision);
  if (verdict.kind !== 'suggest') return null;

  const { line, monthsUnchanged } = verdict;
  const impact = impactOfRaise(line, IMPACT_STEP_PCT);

  return {
    tenantId: input.tenantId,
    kind: 'invoice.raise',
    // Jeden kontrahent i jedna pozycja = jedna rozmowa o stawce.
    topicKey: `invoice.raise:${input.contractorId}:${normalize(line.name)}`,
    title: `${input.contractorName}: ta sama stawka od ${monthsUnchanged} miesięcy`,
    body:
      `„${line.name}” idzie po ${formatPln(line.currentRate)}/${line.unit} ` +
      `od ${formatFullDate(line.lastChangedOn)}. Przy Twoim wolumencie ` +
      `(${formatQuantity(line.annualQuantity)} ${line.unit} w ostatnim roku) ` +
      `każde ${IMPACT_STEP_PCT}% to ${formatPln(impact)} rocznie. ` +
      `Ile ma wynosić nowa stawka — decydujesz Ty; ja przygotuję wiadomość.`,
    fingerprint: fingerprintOf({
      contractor: input.contractorId,
      rate: line.currentRate,
      months: monthsUnchanged,
    }),
    // Rozmowa o stawce nie jest pilna, ale i nie przeterminowuje się szybko.
    expiresAt: new Date(now.getTime() + 60 * DAY_MS),
    priority: 40,
    payload: {
      contractorId: input.contractorId,
      lineName: line.name,
      unit: line.unit,
      currentRate: line.currentRate,
      annualQuantity: line.annualQuantity,
      impactPerStep: impact,
      impactStepPct: IMPACT_STEP_PCT,
      tones: RAISE_TONES,
      // KARTA NIE MA PRZYCISKU „WYŚLIJ". Wysyłka jest możliwa dopiero
      // z widoku treści, po wybraniu tonu i przeczytaniu wiadomości.
      primaryLabel: 'Pokaż treść',
    },
    evidence: [
      { label: 'Historia faktur', href: `/contractors/${input.contractorId}` },
      { label: 'Wystawione faktury', href: '/invoices' },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// Ponowne sprawdzenie przy wysyłce — promień 4
// ═══════════════════════════════════════════════════════════════

export type RaiseSendRecheck =
  | { ok: true }
  | { ok: false; reason: 'stale' | 'blocked'; message: string };

/**
 * Druga kontrola, tuż przed wysłaniem wiadomości.
 *
 * Karta o podwyżce potrafi leżeć w wątku tygodniami. W tym czasie kontrahent
 * mógł przestać płacić albo dostać ponaglenie — a wtedy ta sama wiadomość,
 * która wczoraj była zwykłą informacją, dziś jest naciskiem w trakcie sporu.
 */
export function recheckBeforeRaiseSend(input: {
  relationship: RelationshipState;
  today: Date;
  /** Czy człowiek otworzył widok treści przed kliknięciem. */
  previewOpened: boolean;
}): RaiseSendRecheck {
  // Promień 4: bez obejrzenia treści nie ma wysyłki. Nawet jeżeli interfejs
  // kiedyś się pomyli, silnik nie wypuści wiadomości, której nikt nie czytał.
  if (!input.previewOpened) {
    return {
      ok: false,
      reason: 'blocked',
      message: 'Otwórz treść wiadomości, zanim ją wyślę.',
    };
  }

  const blockers = raiseBlockers(input.relationship, input.today);
  if (blockers.length > 0) {
    return {
      ok: false,
      reason: 'stale',
      message: describeBlockers(blockers),
    };
  }

  return { ok: true };
}

function describeBlockers(blockers: readonly RaiseBlocker[]): string {
  if (blockers.includes('overdue_invoice')) {
    return 'Ten kontrahent ma teraz niezapłaconą fakturę po terminie. Wrócę do rozmowy o stawce, gdy się rozliczy.';
  }
  if (blockers.includes('recent_chase')) {
    return 'Niedawno poszło do niego ponaglenie. Dołożenie do tego podwyżki nie wyjdzie na dobre.';
  }
  return 'Niedawno dostał korektę. Poczekajmy, aż sprawa przycichnie.';
}

// ═══════════════════════════════════════════════════════════════
// Formatowanie
// ═══════════════════════════════════════════════════════════════

function formatQuantity(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace('.', ',');
}

function formatFullDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${Number(day)}.${month}.${year}`;
}
