/**
 * Liczby dla panelu operatora (krok 52 planu, druga połowa).
 *
 * Sześć liczb, o które prosi plan: trafność, koszt na konto, odsetek
 * przyjętych, odsetek zignorowanych, odsetek cofnięć i liczba zdarzeń
 * zablokowanych przez re-walidację.
 *
 * OSTATNIA Z NICH JEST NAJWAŻNIEJSZA I NAJMNIEJ OCZYWISTA. Re-walidacja
 * blokuje wykonanie, gdy dane zmieniły się między pokazaniem karty
 * a kliknięciem — czyli KAŻDE takie zdarzenie to jedna faktura, która nie
 * poszła podwójnie, albo jedno ponaglenie, które nie poleciało do kogoś,
 * kto już zapłacił. To jest jedyna metryka w tym zestawie, która liczy
 * awarie, DO KTÓRYCH NIE DOSZŁO — i dlatego przy rosnącym ruchu ma prawo
 * rosnąć, a nie maleć.
 *
 * Podział jak wszędzie: część czysta liczy, część z bazą tylko czyta.
 */

import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import type { FloProposalKind } from '@/types/flo';

// ═══════════════════════════════════════════════════════════════
// Cykl życia propozycji
// ═══════════════════════════════════════════════════════════════

export interface ProposalCounts {
  total: number;
  /** Zatwierdzone albo wykonane — RAZEM Z COFNIĘTYMI (patrz `countProposals`). */
  accepted: number;
  /** Odrzucone świadomie — bez cofnięć. */
  dismissed: number;
  /** Wygasłe bez decyzji — to jest właśnie „zignorowane”. */
  expired: number;
  /** Zablokowane warunkiem technicznym (np. brak certyfikatu). */
  blocked: number;
  /** Cofnięte przez człowieka w oknie dziesięciu minut. */
  undone: number;
  /** Zatrzymane przez re-walidację: dane zmieniły się po pokazaniu karty. */
  staleBlocked: number;
}

/**
 * Wiersz `flo_proposals` zawężony do tego, z czego liczą się metryki.
 *
 * `dismissed_reason` JEST TU NIEZBĘDNE, nie ozdobne: sam `status` nie
 * odróżnia cofnięcia od odrzucenia ani blokady re-walidacyjnej od
 * wygaśnięcia z braku decyzji.
 */
export interface ProposalLifecycleRow {
  status: string;
  dismissed_reason?: string | null;
}

export interface ProposalRates {
  acceptedPct: number;
  ignoredPct: number;
  undonePct: number;
}

/**
 * Trzy odsetki — funkcja czysta.
 *
 * ZIGNOROWANE TO WYGASŁE, NIE ODRZUCONE. Odrzucenie jest decyzją i informacją
 * („nie chcę tego”); wygaśnięcie bez kliknięcia znaczy, że karta nie była
 * dość ważna, żeby cokolwiek z nią zrobić. Zlepienie obu w jedną liczbę
 * ukryłoby różnicę między funkcją niechcianą a funkcją niewidoczną.
 *
 * Odsetek cofnięć liczymy OD PRZYJĘTYCH, nie od wszystkich: cofnięcie jest
 * miarą tego, jak często agent zrobił coś, czego człowiek po namyśle nie
 * chciał — a namysł dotyczy tylko tego, na co się zgodził.
 */
export function computeRates(counts: ProposalCounts): ProposalRates {
  const pct = (part: number, whole: number) =>
    whole === 0 ? 0 : Math.round((part / whole) * 100);

  return {
    acceptedPct: pct(counts.accepted, counts.total),
    ignoredPct: pct(counts.expired, counts.total),
    undonePct: pct(counts.undone, counts.accepted),
  };
}

/**
 * Zlicza cykl życia propozycji — funkcja czysta.
 *
 * TRZY ROZRÓŻNIENIA, KTÓRYCH SAM `status` NIE UNIESIE:
 *
 * 1. COFNIĘCIE ZOSTAJE W PRZYJĘTYCH. Po cofnięciu wiersz ma status
 *    `dismissed`, ale człowiek się na tę czynność ZGODZIŁ — zmienił zdanie
 *    dopiero potem. Gdyby cofnięcie wypadało z mianownika, odsetek cofnięć
 *    malałby razem z licznikiem i nigdy nie urósłby powyżej zera.
 * 2. COFNIĘCIE TO NIE ODRZUCENIE. `dismissed` liczy świadome „nie chcę tego”;
 *    cofnięcie ma własny licznik, bo mówi coś zupełnie innego o agencie.
 * 3. BLOKADA RE-WALIDACYJNA TO NIE ZIGNOROWANIE. Wiersz dostaje status
 *    `expired`, ale człowiek go KLIKNĄŁ — to silnik odmówił wykonania, bo
 *    dane się zmieniły. Wliczanie tego do „zignorowanych” zawyżałoby jedyną
 *    metrykę, która mierzy, jak często karta była nieciekawa.
 */
export function countProposals(
  rows: readonly ProposalLifecycleRow[],
): ProposalCounts {
  const counts: ProposalCounts = {
    total: rows.length,
    accepted: 0,
    dismissed: 0,
    expired: 0,
    blocked: 0,
    undone: 0,
    staleBlocked: 0,
  };

  for (const row of rows) {
    const undone = row.dismissed_reason === 'undone';
    const stale = row.dismissed_reason === 'stale';

    if (
      row.status === 'approved' ||
      row.status === 'done' ||
      row.status === 'executing' ||
      undone
    ) {
      counts.accepted++;
    }
    if (row.status === 'dismissed' && !undone) counts.dismissed++;
    if (row.status === 'expired' && !stale) counts.expired++;
    if (row.status === 'blocked') counts.blocked++;
    if (undone) counts.undone++;
    if (stale) counts.staleBlocked++;
  }

  return counts;
}

// ═══════════════════════════════════════════════════════════════
// Koszt modelu na konto
// ═══════════════════════════════════════════════════════════════

/** Cel z części II.9 planu: 0,95 zł na klienta miesięcznie. */
export const COST_TARGET_PLN = 0.95;

/** Twardy limit: 3,00 zł. */
export const COST_HARD_LIMIT_PLN = 3.0;

/** Zakres jednego miesiąca w kalendarzu Europe/Warsaw. */
export interface MonthRange {
  /** Pierwszy dzień miesiąca, „2026-09-01” — granica włączna. */
  from: string;
  /** Pierwszy dzień następnego miesiąca — granica WYŁĄCZNA. */
  to: string;
  /** Etykieta do interfejsu, „wrzesień 2026”. */
  label: string;
}

const MONTHS_PL = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
];

/**
 * Bieżący miesiąc według kalendarza polskiego, nie według strefy serwera.
 *
 * Serwer stoi w Norymberdze i chodzi w UTC, więc przez pierwsze dwie godziny
 * pierwszego dnia miesiąca „dziś” w UTC należy jeszcze do miesiąca
 * poprzedniego. Limit kosztowy jest limitem miesięcznym w rozumieniu klienta
 * i rachunku, więc granicę wyznacza jego kalendarz.
 */
export function warsawMonthRange(now: Date = new Date()): MonthRange {
  const [year, month] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number) as [number, number];

  const pad = (value: number) => String(value).padStart(2, '0');
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    from: `${year}-${pad(month)}-01`,
    to: `${nextYear}-${pad(nextMonth)}-01`,
    label: `${MONTHS_PL[month - 1]} ${year}`,
  };
}

export interface CostStats {
  tenants: number;
  totalUsd: number;
  /** Średni koszt na konto w USD. */
  avgPerTenantUsd: number;
  /** Ile kont przekroczyło cel po przeliczeniu na złotówki. */
  overTarget: number;
  /** Ile kont dobiło do twardego limitu. */
  overHardLimit: number;
}

/**
 * Koszt modelu — funkcja czysta.
 *
 * Kurs podajemy z zewnątrz, zamiast zaszywać: to jest liczba, która zmienia
 * się codziennie, a metryka operatorska licząca po kursie sprzed roku myli
 * bardziej, niż pomaga.
 */
export function computeCost(
  rows: readonly { tenant_id: string; cost_usd: number }[],
  usdToPln: number,
): CostStats {
  const byTenant = new Map<string, number>();

  for (const row of rows) {
    byTenant.set(row.tenant_id, (byTenant.get(row.tenant_id) ?? 0) + Number(row.cost_usd));
  }

  const totals = [...byTenant.values()];
  const totalUsd = totals.reduce((sum, value) => sum + value, 0);

  return {
    tenants: byTenant.size,
    totalUsd: round(totalUsd, 6),
    avgPerTenantUsd: byTenant.size === 0 ? 0 : round(totalUsd / byTenant.size, 6),
    overTarget: totals.filter((usd) => usd * usdToPln > COST_TARGET_PLN).length,
    overHardLimit: totals.filter((usd) => usd * usdToPln > COST_HARD_LIMIT_PLN).length,
  };
}

// ═══════════════════════════════════════════════════════════════
// Panel
// ═══════════════════════════════════════════════════════════════

export interface PanelRow {
  kind: FloProposalKind | string;
  counts: ProposalCounts;
  rates: ProposalRates;
}

export function buildPanelRows(
  rows: readonly (ProposalLifecycleRow & { kind: string })[],
): PanelRow[] {
  const byKind = new Map<string, ProposalLifecycleRow[]>();

  for (const row of rows) {
    const bucket = byKind.get(row.kind) ?? [];
    bucket.push(row);
    byKind.set(row.kind, bucket);
  }

  return [...byKind.entries()]
    .map(([kind, entries]) => {
      const counts = countProposals(entries);
      return { kind, counts, rates: computeRates(counts) };
    })
    .sort((a, b) => b.counts.total - a.counts.total);
}

// ═══════════════════════════════════════════════════════════════
// Odczyty
// ═══════════════════════════════════════════════════════════════

export async function readProposalMetrics(
  db: FloDbClient = floDb(),
): Promise<PanelRow[]> {
  const { data, error } = await db
    .from('flo_proposals')
    .select('kind, status, dismissed_reason');
  if (error) throw new Error(error.message);

  return buildPanelRows(
    (data ?? []).map((row) => ({
      kind: row.kind,
      status: row.status,
      dismissed_reason: row.dismissed_reason,
    })),
  );
}

/** Koszt modelu razem z okresem, za który został policzony. */
export type CostMetrics = CostStats & { period: MonthRange };

/**
 * Koszt modelu za BIEŻĄCY MIESIĄC.
 *
 * Zakres dat jest tu warunkiem poprawności, nie optymalizacją: progi
 * z części II.9 (0,95 zł celu, 3,00 zł twardego limitu) są miesięczne, więc
 * liczone od całej historii każde aktywne konto przekroczyłoby je po
 * kilku miesiącach, siedząc w limicie.
 */
export async function readCostMetrics(
  usdToPln: number,
  db: FloDbClient = floDb(),
  now: Date = new Date(),
): Promise<CostMetrics> {
  const period = warsawMonthRange(now);

  const { data, error } = await db
    .from('flo_usage')
    .select('tenant_id, cost_usd')
    .gte('day', period.from)
    .lt('day', period.to);
  if (error) throw new Error(error.message);

  return {
    ...computeCost(
      (data ?? []).map((row) => ({
        tenant_id: row.tenant_id,
        cost_usd: Number(row.cost_usd),
      })),
      usdToPln,
    ),
    period,
  };
}

/**
 * Liczba zdarzeń zatrzymanych przez re-walidację.
 *
 * Zliczamy momenty, w których człowiek kliknął, a silnik powiedział „dane się
 * zmieniły” — każdy taki wiersz to jedna faktura, która nie poszła podwójnie,
 * albo jedno ponaglenie, które nie poleciało do kogoś, kto już zapłacił.
 * To jedyna metryka w tym zestawie licząca awarie, DO KTÓRYCH NIE DOSZŁO.
 *
 * SZUKAMY POWODU, NIE STATUSU. Re-walidacja zapisuje
 * `status = 'expired', dismissed_reason = 'stale'` (`lib/flo/execute.ts`);
 * status `blocked` znaczy co innego — warunek techniczny, np. brak
 * certyfikatu. Zliczanie po statusie dawało stałe zero.
 */
export async function countBlockedByRevalidation(
  db: FloDbClient = floDb(),
): Promise<number> {
  const { data, error } = await db
    .from('flo_proposals')
    .select('id')
    .eq('dismissed_reason', 'stale');
  if (error) throw new Error(error.message);

  return (data ?? []).length;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
