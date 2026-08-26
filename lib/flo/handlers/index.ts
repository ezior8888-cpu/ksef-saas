/**
 * Rejestr wykonawców propozycji (krok 11 planu agenta FLO).
 *
 * Każdy rodzaj propozycji ma jednego wykonawcę — funkcję, która robi to,
 * na co człowiek właśnie się zgodził. Rejestr zapełnia się stopniowo
 * w blokach 3–10 planu; rodzaj bez wykonawcy nie da się wykonać i agent
 * mówi o tym wprost, zamiast udawać, że coś zrobił.
 *
 * DLACZEGO REJESTR, A NIE `switch`: handlery mieszkają w plikach swoich
 * funkcji (ponaglenia przy ponagleniach, wysyłka przy wysyłce), a nie
 * w jednym rosnącym pliku, który po trzydziestu funkcjach nikomu się nie
 * mieści w głowie. Wykonawca zna tylko rejestr.
 */

import type { FloProposalRow } from '@/lib/flo/db-types';
import type { FloApproveInput, FloProposalKind } from '@/types/flo';

export interface FloHandlerContext {
  proposal: FloProposalRow;
  /** Kto kliknął. Trafia do dziennika audytowego. */
  userId: string;
  /**
   * Zużyty żeton zgody. Handler MUSI przekazać go dalej do funkcji
   * wychodzącej — to jest dowód, że wysyłka ma pokrycie w decyzji człowieka.
   */
  approvalId: string;
  /** Dokładnie to, co człowiek widział, klikając. */
  snapshot: Record<string, unknown>;
  /** Dane z karty: wpisany adres, zaznaczone pozycje, treść po edycji. */
  input?: FloApproveInput;
}

export interface FloHandlerResult {
  /** Jedno zdanie do dziennika i do meldunku dla klienta. */
  summary: string;
  details?: Record<string, unknown>;
}

export type FloHandler = (
  ctx: FloHandlerContext,
) => Promise<FloHandlerResult>;

const handlers = new Map<FloProposalKind, FloHandler>();

export function registerFloHandler(
  kind: FloProposalKind,
  handler: FloHandler,
): void {
  if (handlers.has(kind)) {
    // Dwa wykonawcy tego samego rodzaju oznaczają, że nie wiadomo, który
    // naprawdę wyśle — a przy wysyłce na zewnątrz „nie wiadomo” jest
    // stanem zabronionym.
    throw new Error(`Podwójna rejestracja wykonawcy dla rodzaju: ${kind}`);
  }
  handlers.set(kind, handler);
}

export function getFloHandler(kind: FloProposalKind): FloHandler | null {
  return handlers.get(kind) ?? null;
}

/** Wyłącznie do testów — produkcyjnie rejestr zapełnia się raz, przy starcie. */
export function resetFloHandlers(): void {
  handlers.clear();
}

export function registeredFloKinds(): FloProposalKind[] {
  return [...handlers.keys()];
}
