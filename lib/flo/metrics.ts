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
  /** Zatwierdzone albo wykonane. */
  accepted: number;
  /** Odrzucone świadomie. */
  dismissed: number;
  /** Wygasłe bez decyzji — to jest właśnie „zignorowane”. */
  expired: number;
  /** Zablokowane warunkiem technicznym. */
  blocked: number;
  /** Cofnięte przez człowieka w oknie dziesięciu minut. */
  undone: number;
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

/** Zlicza statusy propozycji — funkcja czysta. */
export function countProposals(
  rows: readonly { status: string; undone?: boolean }[],
): ProposalCounts {
  const counts: ProposalCounts = {
    total: rows.length,
    accepted: 0,
    dismissed: 0,
    expired: 0,
    blocked: 0,
    undone: 0,
  };

  for (const row of rows) {
    if (row.status === 'approved' || row.status === 'done' || row.status === 'executing') {
      counts.accepted++;
    }
    if (row.status === 'dismissed') counts.dismissed++;
    if (row.status === 'expired') counts.expired++;
    if (row.status === 'blocked') counts.blocked++;
    if (row.undone) counts.undone++;
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
  rows: readonly { kind: string; status: string; undone?: boolean }[],
): PanelRow[] {
  const byKind = new Map<string, { status: string; undone?: boolean }[]>();

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
    .select('kind, status, undoable_until');
  if (error) throw new Error(error.message);

  return buildPanelRows(
    (data ?? []).map((row) => ({ kind: row.kind, status: row.status })),
  );
}

export async function readCostMetrics(
  usdToPln: number,
  db: FloDbClient = floDb(),
): Promise<CostStats> {
  const { data, error } = await db.from('flo_usage').select('tenant_id, cost_usd');
  if (error) throw new Error(error.message);

  return computeCost(
    (data ?? []).map((row) => ({
      tenant_id: row.tenant_id,
      cost_usd: Number(row.cost_usd),
    })),
    usdToPln,
  );
}

/**
 * Liczba zdarzeń zablokowanych przez re-walidację.
 *
 * Zliczamy żetony zgody, które zostały wystawione, ale nigdy skonsumowane
 * ze skutkiem — czyli momenty, w których człowiek kliknął, a silnik
 * powiedział „dane się zmieniły”. Każdy taki wiersz to jedna awaria,
 * do której NIE DOSZŁO.
 */
export async function countBlockedByRevalidation(
  db: FloDbClient = floDb(),
): Promise<number> {
  const { data, error } = await db
    .from('flo_proposals')
    .select('id')
    .eq('status', 'blocked');
  if (error) throw new Error(error.message);

  return (data ?? []).length;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
