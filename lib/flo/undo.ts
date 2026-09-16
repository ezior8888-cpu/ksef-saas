/**
 * Cofnięcie czynności agenta (krok 13 planu, mechanizm M15).
 *
 * FLO robi sam wyłącznie rzeczy odwracalne i wewnątrz konta klienta:
 * przypisuje kolumnę KPiR, oznacza fakturę jako opłaconą, wiąże paragon
 * z fakturą. Każda z nich ma dziesięć minut na cofnięcie jednym kliknięciem
 * — z powiadomienia albo z karty, bez szukania w ustawieniach.
 *
 * DLACZEGO DZIESIĘĆ MINUT, A NIE „ZAWSZE”: cofanie po tygodniu to już nie
 * cofnięcie, tylko edycja historii — a przy księgach edycja historii wymaga
 * świadomej decyzji, nie jednego kliknięcia w powiadomieniu. Po tym czasie
 * zmiana zostaje, ale nadal jest widoczna w karcie ze znacznikiem autorstwa:
 * klient wie, kto to zrobił i dlaczego.
 *
 * ZASADA: cofnięcie przywraca WYŁĄCZNIE pola, które agent sam zmienił.
 * Nigdy nie nadpisuje niczego, czego człowiek dotknął w międzyczasie —
 * dlatego przed przywróceniem sprawdzamy, czy wartość nadal jest ta, którą
 * agent ustawił. Jeśli ktoś ją zmienił ręcznie, cofnięcie się wycofuje.
 */

import type { AuditAction } from '@/lib/audit/log';
import { logAuditSystem } from '@/lib/audit/log-system';
import { floDb, type FloDbClient, type FloProposalRow } from '@/lib/flo/db-types';
import { createAdminClient } from '@/lib/supabase/admin';

/** Ile czasu na cofnięcie jednym kliknięciem. */
export const UNDO_WINDOW_MS = 10 * 60_000;

/** Tabele, w których agent wolno mu cokolwiek zmienić samodzielnie. */
export type UndoableTable = 'expenses' | 'invoices' | 'contractors';

export interface UndoRecord {
  /** Kiedy agent wykonał zmianę (ISO). */
  at: string;
  table: UndoableTable;
  rowId: string;
  /** Wartości SPRZED zmiany — tylko pola, które agent ruszył. */
  before: Record<string, string | number | boolean | null>;
  /** Wartości, które agent ustawił — do sprawdzenia, czy nikt ich nie nadpisał. */
  after: Record<string, string | number | boolean | null>;
}

export type UndoResult =
  | { ok: true }
  | { ok: false; reason: 'not_undoable' | 'expired' | 'changed'; message: string };

/**
 * Buduje zapis cofnięcia. Wołane PRZED zmianą, przez wykonawcę czynności
 * kategorii pierwszej — stan sprzed zmiany trzeba znać zawczasu, bo potem
 * już go nie ma.
 */
export function captureUndo(
  table: UndoableTable,
  rowId: string,
  before: UndoRecord['before'],
  after: UndoRecord['after'],
  now: Date = new Date(),
): UndoRecord {
  return { at: now.toISOString(), table, rowId, before, after };
}

/** Do kiedy da się cofnąć — interfejs pokazuje z tego odliczanie. */
export function undoableUntil(record: UndoRecord): string {
  return new Date(Date.parse(record.at) + UNDO_WINDOW_MS).toISOString();
}

export function readUndoRecord(payload: Record<string, unknown>): UndoRecord | null {
  const raw = payload.undo;
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Partial<UndoRecord>;
  if (
    typeof candidate.at !== 'string' ||
    !Number.isFinite(Date.parse(candidate.at)) ||
    typeof candidate.rowId !== 'string' ||
    (candidate.table !== 'expenses' &&
      candidate.table !== 'invoices' &&
      candidate.table !== 'contractors') ||
    typeof candidate.before !== 'object' ||
    candidate.before === null ||
    Array.isArray(candidate.before) ||
    typeof candidate.after !== 'object' ||
    candidate.after === null ||
    Array.isArray(candidate.after)
  ) {
    return null;
  }
  const allowedFields: Record<UndoableTable, readonly string[]> = {
    expenses: ['kpir_column', 'is_reviewed', 'is_deductible'],
    // Legacy invoice-only undo never removes the triggering payment.
    invoices: [],
    contractors: [],
  };
  const before = candidate.before as Record<string, unknown>;
  const after = candidate.after as Record<string, unknown>;
  const keys = Object.keys(before);
  const scalar = (value: unknown) => value === null ||
    typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value));
  if (!keys.length || keys.length !== Object.keys(after).length ||
      keys.some((key) => !allowedFields[candidate.table!].includes(key) ||
        !Object.hasOwn(after, key) || !scalar(before[key]) || !scalar(after[key]))) {
    return null;
  }
  return {
    at: candidate.at,
    table: candidate.table,
    rowId: candidate.rowId,
    before: candidate.before as UndoRecord['before'],
    after: (candidate.after ?? {}) as UndoRecord['after'],
  };
}

/**
 * Czy tę zmianę wolno teraz cofnąć — funkcja czysta, całe sedno reguły.
 *
 * `current` to aktualne wartości pól, które agent zmienił. Rozjazd z tym,
 * co agent ustawił, oznacza, że ktoś poprawił to ręcznie — i wtedy cofnięcie
 * skasowałoby cudzą pracę zamiast własnej.
 */
export function evaluateUndo(
  record: UndoRecord | null,
  current: Record<string, unknown> | null,
  now: Date = new Date(),
): UndoResult {
  if (!record) {
    return {
      ok: false,
      reason: 'not_undoable',
      message: 'Tej zmiany nie da się cofnąć.',
    };
  }

  if (Date.parse(record.at) + UNDO_WINDOW_MS <= now.getTime()) {
    return {
      ok: false,
      reason: 'expired',
      message:
        'Minęło dziesięć minut, więc nie cofam tego automatycznie. Możesz to poprawić ręcznie.',
    };
  }

  if (!current) {
    return {
      ok: false,
      reason: 'changed',
      message: 'Nie znajduję już tego dokumentu.',
    };
  }

  for (const [field, expected] of Object.entries(record.after)) {
    if ((current[field] ?? null) !== expected) {
      return {
        ok: false,
        reason: 'changed',
        message: 'W międzyczasie poprawiłeś to ręcznie — zostawiam Twoją wersję.',
      };
    }
  }

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// Wykonanie cofnięcia
// ═══════════════════════════════════════════════════════════════

interface UndoQuery {
  eq(column: string, value: string | number | boolean): UndoQuery;
  is(column: string, value: null): UndoQuery;
  select(columns: string): UndoQuery;
  maybeSingle(): Promise<{
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }>;
}
interface UndoClient {
  from(table: UndoableTable): {
    select(columns: string): UndoQuery;
    update(patch: Record<string, unknown>): UndoQuery;
  };
}

export async function undoAction(
  proposalId: string,
  userId: string,
  tenantId: string,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
  rows: UndoClient = createAdminClient() as unknown as UndoClient,
): Promise<UndoResult> {
  const loaded = await db
    .from('flo_proposals')
    .select('*')
    .eq('id', proposalId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (loaded.error) throw new Error(loaded.error.message);
  const proposal = loaded.data as FloProposalRow | null;
  if (!proposal) {
    return {
      ok: false,
      reason: 'not_undoable',
      message: 'Tej zmiany nie da się cofnąć.',
    };
  }

  const record = readUndoRecord(proposal.payload ?? {});
  if (!record) {
    return {
      ok: false,
      reason: 'not_undoable',
      message: 'Tej zmiany nie da się cofnąć.',
    };
  }

  const fields = Object.keys(record.after);
  const current = await rows
    .from(record.table)
    .select(['id', ...fields].join(', '))
    .eq('id', record.rowId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (current.error) throw new Error(current.error.message);

  const verdict = evaluateUndo(record, current.data, now);
  if (!verdict.ok) return verdict;

  // Compare-and-set in the same UPDATE: a manual edit after the read wins.
  let restoreQuery = rows
    .from(record.table)
    .update(record.before)
    .eq('id', record.rowId)
    .eq('tenant_id', tenantId);
  for (const [field, expected] of Object.entries(record.after)) {
    restoreQuery = expected === null
      ? restoreQuery.is(field, null)
      : restoreQuery.eq(field, expected);
  }
  const restore = await restoreQuery.select('id').maybeSingle();

  if (restore.error) throw new Error(restore.error.message);
  if (!restore.data) return { ok: false, reason: 'changed', message: 'Dokument zmienił się w międzyczasie — nie cofam zmian.' };

  // Powód `undone`, a NIE `not_now`: karta znika z wątku tak samo jak przy
  // odrzuceniu, ale to są dwa różne zdarzenia. „Nie teraz” znaczy „nie chcę
  // tego”; cofnięcie znaczy „zgodziłem się, a potem zmieniłem zdanie” — czyli
  // agent zrobił coś, czego człowiek po namyśle nie chciał. Zlepienie ich
  // w jeden zapis kasowało jedyną metrykę, która to mierzy.
  await db
    .from('flo_proposals')
    .update({ status: 'dismissed', dismissed_reason: 'undone' })
    .eq('id', proposalId)
    .eq('tenant_id', tenantId);

  await logAuditSystem({
    tenantId: proposal.tenant_id,
    userId,
    action: 'flo.proposal.undone' as AuditAction,
    entityType: 'flo_proposal',
    entityId: proposalId,
    metadata: {
      actor: 'flo',
      kind: proposal.kind,
      table: record.table,
      rowId: record.rowId,
      restored: Object.keys(record.before),
    },
  });

  return { ok: true };
}
